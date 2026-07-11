import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";
import type { CustomerIdentity, StaffIdentity } from "../auth/auth.identity";
import { validateOrderProductAccess } from "../catalog/order-access";
import { notifyOrderStatusChanged, notifyStaffNewOrder, runPushTask } from "../notifications/onesignal.service";
import { OrderEngineError } from "./order-errors";
import {
  assertOrderStatusTransition,
  isOrderStatus,
  type OrderStatus,
} from "./order-status";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ORDER_LINES = 100;
const MAX_ITEM_QUANTITY = 1_000_000;

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
};

export type CreateOrderInput = {
  identity: CustomerIdentity;
  idempotencyKey: string;
  items: CreateOrderItemInput[];
};

export type CreateOrderHooks = {
  afterOrderInserted?: (client: PoolClient, orderId: string) => Promise<void> | void;
};

type CustomerRow = {
  id: string;
  approval_status: "pending" | "approved" | "rejected";
  status: "active" | "inactive" | "blocked";
  price_group_id: string | null;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string;
  unit_label: string | null;
  product_type: "physical" | "bundle" | "service";
  status: string;
  ordering_enabled: boolean;
  is_active: boolean;
  is_public: boolean;
  min_order_qty: string;
  requested_quantity: string;
  base_price: string | null;
  wholesale_price: string | null;
  price_group_price: string | null;
  data_issues: unknown;
  bundle_item_count: string;
  invalid_bundle_item_count: string;
  bundle_snapshot: unknown;
};

type ExistingOrderRow = {
  id: string;
  request_fingerprint: string | null;
};

type LockedOrderRow = {
  id: string;
  customer_id: string;
  order_code: string | null;
  status: string;
};

export function normalizeOrderItems(value: unknown): CreateOrderItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OrderEngineError("ORDER_ITEMS_REQUIRED", 400, "Order must contain at least one item.");
  }
  if (value.length > MAX_ORDER_LINES) {
    throw new OrderEngineError(
      "ORDER_TOO_MANY_ITEMS",
      400,
      `Order cannot contain more than ${MAX_ORDER_LINES} lines.`,
    );
  }

  const quantities = new Map<string, number>();
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== "object") {
      throw new OrderEngineError("INVALID_ORDER_ITEM", 400, "Each order item must be an object.");
    }

    const item = rawItem as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId.trim().toLowerCase() : "";
    const quantity = Number(item.quantity);

    if (!UUID_PATTERN.test(productId)) {
      throw new OrderEngineError("INVALID_PRODUCT_ID", 400, "productId must be a UUID.");
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
      throw new OrderEngineError(
        "INVALID_ORDER_QUANTITY",
        400,
        `quantity must be a positive integer not greater than ${MAX_ITEM_QUANTITY}.`,
        { productId },
      );
    }

    const combinedQuantity = (quantities.get(productId) ?? 0) + quantity;
    if (combinedQuantity > MAX_ITEM_QUANTITY) {
      throw new OrderEngineError("INVALID_ORDER_QUANTITY", 400, "Combined quantity is too large.", {
        productId,
      });
    }
    quantities.set(productId, combinedQuantity);
  }

  return [...quantities.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

export function normalizeIdempotencyKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (key.length < 8 || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new OrderEngineError(
      "INVALID_IDEMPOTENCY_KEY",
      400,
      "Idempotency-Key must contain between 8 and 200 printable characters.",
    );
  }
  return key;
}

function orderFingerprint(items: CreateOrderItemInput[]): string {
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function createOrderCode(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `BS-${date}-${suffix}`;
}

async function lockAndRefreshCustomer(
  client: PoolClient,
  identity: CustomerIdentity,
): Promise<CustomerIdentity> {
  const result = await client.query<CustomerRow>(
    `SELECT
       id::text,
       approval_status,
       status,
       price_group_id::text
     FROM customers
     WHERE id = $1
     FOR SHARE`,
    [identity.customerId],
  );
  const customer = result.rows[0];

  if (!customer) {
    throw new OrderEngineError("CUSTOMER_PROFILE_REQUIRED", 403, "Customer profile was not found.");
  }
  if (customer.status === "blocked") {
    throw new OrderEngineError("CUSTOMER_BLOCKED", 403, "Customer account is blocked.");
  }
  if (customer.status !== "active") {
    throw new OrderEngineError("CUSTOMER_INACTIVE", 403, "Customer account is inactive.");
  }
  if (customer.approval_status === "rejected") {
    throw new OrderEngineError("CUSTOMER_REJECTED", 403, "Customer approval was rejected.");
  }
  if (customer.approval_status !== "approved") {
    throw new OrderEngineError("CUSTOMER_PENDING", 403, "Customer approval is pending.");
  }

  return {
    ...identity,
    approvalStatus: customer.approval_status,
    accountStatus: customer.status,
    priceGroupId: customer.price_group_id,
  };
}

async function queryOrderProducts(
  client: PoolClient,
  items: CreateOrderItemInput[],
  priceGroupId: string | null,
): Promise<ProductRow[]> {
  const productIds = items.map((item) => item.productId);
  const quantities = items.map((item) => item.quantity);

  const result = await client.query<ProductRow>(
    `WITH requested(product_id, quantity) AS (
       SELECT *
       FROM unnest($1::uuid[], $2::numeric[])
     )
     SELECT
       product.id::text,
       product.sku,
       product.name,
       COALESCE(product.unit_label, product.unit) AS unit_label,
       product.product_type,
       product.status,
       product.is_orderable AS ordering_enabled,
       product.is_active,
       product.is_public,
       product.min_order_qty::text,
       requested.quantity::text AS requested_quantity,
       product.base_price::text,
       product.wholesale_price::text,
       customer_price.price::text AS price_group_price,
       product.data_issues,
       COALESCE(bundle_stats.bundle_item_count, 0)::text AS bundle_item_count,
       COALESCE(bundle_stats.invalid_bundle_item_count, 0)::text AS invalid_bundle_item_count,
       CASE
         WHEN product.product_type = 'bundle' THEN
           jsonb_build_object('components', COALESCE(bundle_stats.components, '[]'::jsonb))
         ELSE NULL
       END AS bundle_snapshot
     FROM requested
     JOIN products product ON product.id = requested.product_id
     LEFT JOIN LATERAL (
       SELECT product_price.price
       FROM product_prices product_price
       WHERE product_price.product_id = product.id
         AND product_price.price_group_id = $3::uuid
         AND product_price.min_quantity <= requested.quantity
       ORDER BY product_price.min_quantity DESC
       LIMIT 1
     ) customer_price ON true
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS bundle_item_count,
         COUNT(*) FILTER (
           WHERE component.id IS NULL
              OR component.is_public IS DISTINCT FROM true
              OR component.is_active IS DISTINCT FROM true
              OR COALESCE(component.status, '') NOT IN ('active', 'needs_review')
              OR component.is_orderable IS DISTINCT FROM true
              OR NULLIF(BTRIM(component.sku), '') IS NULL
              OR NULLIF(BTRIM(COALESCE(component.unit_label, component.unit)), '') IS NULL
              OR NOT (
                COALESCE(component.wholesale_price, 0) > 0
                OR COALESCE(component.base_price, 0) > 0
                OR EXISTS (
                  SELECT 1
                  FROM product_prices component_price
                  WHERE component_price.product_id = component.id
                    AND component_price.price > 0
                )
              )
         ) AS invalid_bundle_item_count,
         jsonb_agg(
           jsonb_build_object(
             'productId', component.id,
             'sku', component.sku,
             'name', component.name,
             'unit', COALESCE(bundle_item.unit, component.unit_label, component.unit),
             'quantity', bundle_item.quantity
           )
           ORDER BY bundle_item.sort_order, bundle_item.created_at
         ) FILTER (WHERE bundle_item.id IS NOT NULL) AS components
       FROM product_bundle_items bundle_item
       LEFT JOIN products component ON component.id = bundle_item.component_product_id
       WHERE bundle_item.bundle_product_id = product.id
     ) bundle_stats ON true
     FOR SHARE OF product`,
    [productIds, quantities, priceGroupId],
  );

  return result.rows;
}

async function loadOrder(client: PoolClient, orderId: string) {
  const result = await client.query(
    `SELECT
       orders.id::text,
       orders.order_code AS "orderCode",
       orders.customer_id::text AS "customerId",
       orders.status,
       orders.currency,
       orders.subtotal::float8,
       orders.discount_total::float8 AS "discountTotal",
       orders.total_amount::float8 AS "totalAmount",
       orders.created_at AS "createdAt",
       orders.updated_at AS "updatedAt",
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'id', item.id,
             'productId', item.product_id,
             'sku', item.sku,
             'name', item.name,
             'unit', item.unit,
             'productType', item.product_type,
             'quantity', item.quantity,
             'unitPrice', item.unit_price,
             'lineTotal', item.line_total,
             'bundleSnapshot', item.bundle_snapshot,
             'snapshotVersion', item.snapshot_version
           ) ORDER BY item.created_at, item.id
         ) FILTER (WHERE item.id IS NOT NULL),
         '[]'::jsonb
       ) AS items
     FROM orders
     LEFT JOIN order_items item ON item.order_id = orders.id
     WHERE orders.id = $1
     GROUP BY orders.id`,
    [orderId],
  );

  if (!result.rows[0]) {
    throw new OrderEngineError("ORDER_NOT_FOUND", 404, "Order was not found.");
  }
  return result.rows[0];
}

export async function createOrder(
  input: CreateOrderInput,
  options: { db?: Pool; hooks?: CreateOrderHooks } = {},
) {
  const db = options.db ?? getDb();
  const items = normalizeOrderItems(input.items);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const fingerprint = orderFingerprint(items);
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const customerIdentity = await lockAndRefreshCustomer(client, input.identity);

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      customerIdentity.customerId,
      idempotencyKey,
    ]);

    const existingResult = await client.query<ExistingOrderRow>(
      `SELECT id::text, request_fingerprint
       FROM orders
       WHERE customer_id = $1
         AND idempotency_key = $2`,
      [customerIdentity.customerId, idempotencyKey],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) {
        throw new OrderEngineError(
          "IDEMPOTENCY_KEY_REUSED",
          409,
          "Idempotency-Key was already used with a different order payload.",
        );
      }
      const order = await loadOrder(client, existing.id);
      await client.query("COMMIT");
      return { order, replayed: true };
    }

    const products = await queryOrderProducts(client, items, customerIdentity.priceGroupId);
    if (products.length !== items.length) {
      const foundIds = new Set(products.map((product) => product.id));
      throw new OrderEngineError("PRODUCT_NOT_FOUND", 422, "One or more products were not found.", {
        productIds: items.filter((item) => !foundIds.has(item.productId)).map((item) => item.productId),
      });
    }

    const snapshots = products.map((product) => {
      const quantity = Number(product.requested_quantity);
      const minimumQuantity = Number(product.min_order_qty);

      if (!Number.isSafeInteger(quantity) || quantity < minimumQuantity) {
        throw new OrderEngineError(
          "MINIMUM_ORDER_QUANTITY_NOT_MET",
          422,
          "Requested quantity is below the product minimum.",
          { productId: product.id, quantity, minimumQuantity },
        );
      }
      if (!['active', 'needs_review'].includes(product.status)) {
        throw new OrderEngineError("PRODUCT_NOT_ORDERABLE", 422, "Product is not available for ordering.", {
          productId: product.id,
        });
      }

      const access = validateOrderProductAccess(customerIdentity, {
        sku: product.sku,
        unitLabel: product.unit_label,
        productType: product.product_type,
        isOrderable: product.ordering_enabled,
        isActive: product.is_active,
        isPublic: product.is_public,
        bundleItemCount: Number(product.bundle_item_count),
        invalidBundleItemCount: Number(product.invalid_bundle_item_count),
        sourceDataIssues: product.data_issues,
        basePrice: product.base_price,
        wholesalePrice: product.wholesale_price,
        priceGroupPrice: product.price_group_price,
      });

      if (!access.allowed) {
        throw new OrderEngineError(access.code, 422, "Product cannot be ordered.", {
          productId: product.id,
          dataIssues: access.dataIssues,
        });
      }

      return {
        ...product,
        quantity,
        unitPrice: access.unitPrice,
        lineTotal: money(access.unitPrice * quantity),
      };
    });

    if (snapshots.length === 0) {
      throw new OrderEngineError("ORDER_ITEMS_REQUIRED", 400, "Order must contain at least one item.");
    }

    const subtotal = money(snapshots.reduce((sum, item) => sum + item.lineTotal, 0));
    const totalAmount = subtotal;
    const orderResult = await client.query<{ id: string }>(
      `INSERT INTO orders (
         order_code,
         customer_id,
         status,
         subtotal,
         discount_total,
         total_amount,
         currency,
         submitted_at,
         idempotency_key,
         request_fingerprint
       ) VALUES ($1, $2, 'pending', $3, 0, $3, 'VND', now(), $4, $5)
       RETURNING id::text`,
      [createOrderCode(), customerIdentity.customerId, totalAmount, idempotencyKey, fingerprint],
    );
    const orderId = orderResult.rows[0].id;

    await options.hooks?.afterOrderInserted?.(client, orderId);

    for (const item of snapshots) {
      await client.query(
        `INSERT INTO order_items (
           order_id,
           product_id,
           sku,
           name,
           product_name,
           unit,
           quantity,
           unit_price,
           line_total,
           total_price,
           product_type,
           bundle_snapshot,
           snapshot_version
         ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $8, $9, $10, 1)`,
        [
          orderId,
          item.id,
          item.sku,
          item.name,
          item.unit_label,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          item.product_type,
          item.product_type === "bundle" ? item.bundle_snapshot : null,
        ],
      );
    }

    await client.query(
      `INSERT INTO order_status_logs (
         order_id,
         from_status,
         to_status,
         actor_type,
         actor_id,
         note
       ) VALUES ($1, NULL, 'pending', 'customer', $2, 'Order created')`,
      [orderId, customerIdentity.clerkUserId],
    );

    const order = await loadOrder(client, orderId);
    await client.query("COMMIT");
    runPushTask("new order", () => notifyStaffNewOrder({ orderId }));
    return { order, replayed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function assertActiveStaff(identity: StaffIdentity): void {
  if (!identity.isActive) {
    throw new OrderEngineError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  }
}

export async function listAdminOrders(
  identity: StaffIdentity,
  input: { status?: string | null; limit?: number } = {},
  db: Pool = getDb(),
) {
  assertActiveStaff(identity);
  if (input.status && !isOrderStatus(input.status)) {
    throw new OrderEngineError("INVALID_ORDER_STATUS", 400, "Unknown order status.");
  }
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 100);
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (input.status) {
    values.push(input.status);
    clauses.push(`orders.status = $${values.length}`);
  }
  values.push(limit);

  const result = await db.query(
    `SELECT
       orders.id::text,
       orders.order_code AS "orderCode",
       orders.customer_id::text AS "customerId",
       customer.name AS "customerName",
       customer.shop_name AS "shopName",
       orders.status,
       orders.currency,
       orders.subtotal::float8,
       orders.discount_total::float8 AS "discountTotal",
       orders.total_amount::float8 AS "totalAmount",
       orders.created_at AS "createdAt",
       COUNT(item.id)::int AS "itemCount"
     FROM orders
     JOIN customers customer ON customer.id = orders.customer_id
     LEFT JOIN order_items item ON item.order_id = orders.id
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     GROUP BY orders.id, customer.id
     ORDER BY orders.created_at DESC, orders.id DESC
     LIMIT $${values.length}`,
    values,
  );

  return { orders: result.rows, total: result.rows.length };
}

export async function transitionOrderStatus(
  identity: StaffIdentity,
  input: { orderId: string; status: OrderStatus; note?: string | null },
  db: Pool = getDb(),
) {
  assertActiveStaff(identity);
  if (!UUID_PATTERN.test(input.orderId)) {
    throw new OrderEngineError("INVALID_ORDER_ID", 400, "orderId must be a UUID.");
  }
  if (!isOrderStatus(input.status)) {
    throw new OrderEngineError("INVALID_ORDER_STATUS", 400, "Unknown order status.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const staffResult = await client.query<{ is_active: boolean }>(
      "SELECT is_active FROM staff_users WHERE id = $1 FOR SHARE",
      [identity.staffId],
    );
    if (staffResult.rows[0]?.is_active !== true) {
      throw new OrderEngineError("STAFF_INACTIVE", 403, "Staff account is inactive.");
    }

    const orderResult = await client.query<LockedOrderRow>(
      "SELECT id::text, customer_id::text, order_code, status FROM orders WHERE id = $1 FOR UPDATE",
      [input.orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new OrderEngineError("ORDER_NOT_FOUND", 404, "Order was not found.");
    }
    if (!isOrderStatus(order.status)) {
      throw new OrderEngineError("INVALID_ORDER_STATUS", 409, "Stored order status is invalid.");
    }

    assertOrderStatusTransition(order.status, input.status);

    await client.query(
      `UPDATE orders
       SET
         status = $2,
         confirmed_at = CASE WHEN $2 = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
         cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
         updated_at = now()
       WHERE id = $1`,
      [input.orderId, input.status],
    );
    await client.query(
      `INSERT INTO order_status_logs (
         order_id,
         from_status,
         to_status,
         actor_type,
         actor_id,
         note
       ) VALUES ($1, $2, $3, 'staff', $4, $5)`,
      [input.orderId, order.status, input.status, identity.clerkUserId, input.note?.trim() || null],
    );

    const updatedOrder = await loadOrder(client, input.orderId);
    await client.query("COMMIT");
    runPushTask("order status", () => notifyOrderStatusChanged({
      customerId: order.customer_id,
      orderId: input.orderId,
      orderCode: order.order_code,
      status: input.status,
    }));
    return { order: updatedOrder };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
