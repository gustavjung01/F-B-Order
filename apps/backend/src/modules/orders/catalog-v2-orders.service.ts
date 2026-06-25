import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";
import type { CustomerIdentity } from "../auth/auth.identity";
import {
  catalogSelectionKey,
  normalizeChoiceKey,
  parseCatalogChoiceGroups,
  validateCatalogSelections,
} from "../catalog-v2/catalog-v2-choices";
import {
  evaluateCatalogV2Pricing,
  type CatalogV2PriceRow,
} from "../catalog-v2/catalog-v2.pricing";
import { OrderEngineError } from "./order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ORDER_LINES = 100;
const MAX_ITEM_QUANTITY = 1_000_000;
const MAX_SELECTION_COUNT = 20;
const MAX_SELECTION_VALUE_LENGTH = 200;

export type CatalogV2OrderItemInput = {
  variantId: string;
  quantity: number;
  selections: Record<string, string>;
  selectionKey: string;
};

type CustomerRow = {
  id: string;
  approval_status: "pending" | "approved" | "rejected";
  status: "active" | "inactive" | "blocked";
  price_group_id: string | null;
};

type ExistingOrderRow = {
  id: string;
  request_fingerprint: string | null;
};

type CatalogVariantOrderRow = CatalogV2PriceRow & {
  variant_id: string;
  catalog_product_id: string;
  sku: string;
  name: string;
  options: unknown;
  choice_groups: unknown;
  product_status: string;
  requested_quantity: string;
  requested_selection_key: string;
};

function normalizeSelections(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrderEngineError("INVALID_SELECTION", 400, "selections must be an object.");
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_SELECTION_COUNT) {
    throw new OrderEngineError("INVALID_SELECTION", 400, "Too many product selections.");
  }

  const normalized = new Map<string, string>();
  for (const [rawKey, rawValue] of entries) {
    const key = normalizeChoiceKey(rawKey);
    const selected = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!key || !selected || selected.length > MAX_SELECTION_VALUE_LENGTH) {
      throw new OrderEngineError("INVALID_SELECTION", 400, "Invalid product selection.");
    }
    if (normalized.has(key)) {
      throw new OrderEngineError("INVALID_SELECTION", 400, `Duplicate product selection ${key}.`);
    }
    normalized.set(key, selected);
  }

  return Object.fromEntries([...normalized.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function normalizeCatalogV2OrderItems(value: unknown): CatalogV2OrderItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OrderEngineError("ORDER_ITEMS_REQUIRED", 400, "Order must contain at least one item.");
  }
  if (value.length > MAX_ORDER_LINES) {
    throw new OrderEngineError("ORDER_TOO_MANY_ITEMS", 400, `Order cannot contain more than ${MAX_ORDER_LINES} lines.`);
  }

  const combined = new Map<string, CatalogV2OrderItemInput>();
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== "object") {
      throw new OrderEngineError("INVALID_ORDER_ITEM", 400, "Each order item must be an object.");
    }

    const item = rawItem as Record<string, unknown>;
    const rawVariantId = item.variantId ?? item.variant_id;
    const variantId = typeof rawVariantId === "string" ? rawVariantId.trim().toLowerCase() : "";
    const quantity = Number(item.quantity);
    if (!UUID_PATTERN.test(variantId)) {
      throw new OrderEngineError("INVALID_VARIANT_ID", 400, "variantId must be a UUID.");
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
      throw new OrderEngineError(
        "INVALID_ORDER_QUANTITY",
        400,
        `quantity must be a positive integer not greater than ${MAX_ITEM_QUANTITY}.`,
        { variantId },
      );
    }

    const selections = normalizeSelections(item.selections);
    const selectionKey = catalogSelectionKey(selections);
    if (selectionKey.length > 500) {
      throw new OrderEngineError("INVALID_SELECTION", 400, "Product selection identity is too long.");
    }
    const suppliedSelectionKey = item.selectionKey ?? item.selection_key;
    if (suppliedSelectionKey !== undefined && String(suppliedSelectionKey).trim() !== selectionKey) {
      throw new OrderEngineError("SELECTION_KEY_MISMATCH", 400, "selectionKey does not match selections.", {
        variantId,
      });
    }

    const identity = `${variantId}::${selectionKey}`;
    const existing = combined.get(identity);
    const combinedQuantity = (existing?.quantity ?? 0) + quantity;
    if (combinedQuantity > MAX_ITEM_QUANTITY) {
      throw new OrderEngineError("INVALID_ORDER_QUANTITY", 400, "Combined quantity is too large.", {
        variantId,
        selectionKey,
      });
    }
    combined.set(identity, { variantId, quantity: combinedQuantity, selections, selectionKey });
  }

  return [...combined.values()].sort((left, right) => {
    const variantOrder = left.variantId.localeCompare(right.variantId);
    return variantOrder || left.selectionKey.localeCompare(right.selectionKey);
  });
}

function orderFingerprint(items: CatalogV2OrderItemInput[]) {
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}

function createOrderCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `BS-${date}-${suffix}`;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

async function lockAndRefreshCustomer(client: PoolClient, identity: CustomerIdentity): Promise<CustomerIdentity> {
  const result = await client.query<CustomerRow>(
    `SELECT id::text, approval_status, status, price_group_id::text
     FROM customers
     WHERE id = $1
     FOR SHARE`,
    [identity.customerId],
  );
  const customer = result.rows[0];
  if (!customer) throw new OrderEngineError("CUSTOMER_PROFILE_REQUIRED", 403, "Customer profile was not found.");
  if (customer.status === "blocked") throw new OrderEngineError("CUSTOMER_BLOCKED", 403, "Customer account is blocked.");
  if (customer.status !== "active") throw new OrderEngineError("CUSTOMER_INACTIVE", 403, "Customer account is inactive.");
  if (customer.approval_status === "rejected") throw new OrderEngineError("CUSTOMER_REJECTED", 403, "Customer approval was rejected.");
  if (customer.approval_status !== "approved") throw new OrderEngineError("CUSTOMER_PENDING", 403, "Customer approval is pending.");
  return {
    ...identity,
    approvalStatus: customer.approval_status,
    accountStatus: customer.status,
    priceGroupId: customer.price_group_id,
  };
}

async function queryVariants(
  client: PoolClient,
  items: CatalogV2OrderItemInput[],
  priceGroupId: string | null,
) {
  const result = await client.query<CatalogVariantOrderRow>(
    `WITH requested(variant_id, quantity, selection_key) AS (
       SELECT * FROM unnest($1::uuid[], $2::numeric[], $3::text[])
     )
     SELECT
       variant.id::text AS variant_id,
       product.id::text AS catalog_product_id,
       variant.sku,
       variant.name,
       variant.options,
       product.choice_groups,
       product.status AS product_status,
       requested.quantity::text AS requested_quantity,
       requested.selection_key AS requested_selection_key,
       variant.price_mode,
       variant.price_label,
       variant.retail_price::text,
       variant.shop_price::text,
       grouped.price::text AS price_group_price,
       variant.status,
       variant.is_orderable,
       variant.is_active,
       variant.is_public
     FROM requested
     JOIN catalog_variants variant ON variant.id = requested.variant_id
     JOIN catalog_products product ON product.id = variant.product_id
     LEFT JOIN LATERAL (
       SELECT price.price
       FROM catalog_variant_prices price
       WHERE price.variant_id = variant.id
         AND price.price_group_id = $4::uuid
         AND price.min_quantity <= requested.quantity
       ORDER BY price.min_quantity DESC
       LIMIT 1
     ) grouped ON true
     WHERE variant.catalog_version = 'hung-phat-v2'
       AND product.catalog_version = 'hung-phat-v2'
     FOR SHARE OF variant, product`,
    [
      items.map((item) => item.variantId),
      items.map((item) => item.quantity),
      items.map((item) => item.selectionKey),
      priceGroupId,
    ],
  );
  return result.rows;
}

function selectionError(error: unknown): never {
  const typed = error as { code?: string; status?: number; message?: string };
  if (typed.code && typed.status) {
    throw new OrderEngineError(typed.code, typed.status, typed.message || "Invalid product selection.");
  }
  throw error;
}

function readOptions(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function unitFromOptions(options: Record<string, unknown>) {
  for (const key of ["sell_unit", "package", "size", "weight", "volume"]) {
    const value = options[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Sản phẩm";
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
             'variantId', item.variant_id,
             'sku', item.sku,
             'name', item.name,
             'unit', item.unit,
             'productType', item.product_type,
             'quantity', item.quantity,
             'unitPrice', item.unit_price,
             'lineTotal', item.line_total,
             'selections', COALESCE(item.selection_snapshot -> 'selections', '{}'::jsonb),
             'selectionKey', COALESCE(item.selection_snapshot ->> 'selectionKey', ''),
             'selectionSnapshot', item.selection_snapshot,
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
  if (!result.rows[0]) throw new OrderEngineError("ORDER_NOT_FOUND", 404, "Order was not found.");
  return result.rows[0];
}

export async function createCatalogV2Order(
  input: {
    identity: CustomerIdentity;
    idempotencyKey: string;
    items: CatalogV2OrderItemInput[];
  },
  db: Pool = getDb(),
) {
  const items = normalizeCatalogV2OrderItems(input.items);
  const fingerprint = orderFingerprint(items);
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const customerIdentity = await lockAndRefreshCustomer(client, input.identity);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      customerIdentity.customerId,
      input.idempotencyKey,
    ]);

    const existingResult = await client.query<ExistingOrderRow>(
      `SELECT id::text, request_fingerprint
       FROM orders
       WHERE customer_id = $1 AND idempotency_key = $2`,
      [customerIdentity.customerId, input.idempotencyKey],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) {
        throw new OrderEngineError("IDEMPOTENCY_KEY_REUSED", 409, "Idempotency-Key was already used with a different order payload.");
      }
      const order = await loadOrder(client, existing.id);
      await client.query("COMMIT");
      return { order, replayed: true };
    }

    const rows = await queryVariants(client, items, customerIdentity.priceGroupId);
    if (rows.length !== items.length) {
      const found = new Set(rows.map((row) => `${row.variant_id}::${row.requested_selection_key}`));
      throw new OrderEngineError("VARIANT_NOT_FOUND", 422, "One or more catalog variants were not found.", {
        variantIds: items
          .filter((item) => !found.has(`${item.variantId}::${item.selectionKey}`))
          .map((item) => item.variantId),
      });
    }

    const inputByIdentity = new Map(items.map((item) => [`${item.variantId}::${item.selectionKey}`, item]));
    const snapshots = rows.map((row) => {
      const item = inputByIdentity.get(`${row.variant_id}::${row.requested_selection_key}`);
      if (!item) throw new OrderEngineError("INVALID_ORDER_ITEM", 400, "Catalog order line identity is invalid.");
      if (row.product_status !== "active") {
        throw new OrderEngineError("PRODUCT_NOT_ORDERABLE", 422, "Catalog product is not active.", { variantId: row.variant_id });
      }

      const groups = parseCatalogChoiceGroups(row.choice_groups);
      let validated: { selections: Record<string, string>; selectionKey: string };
      try {
        validated = validateCatalogSelections(item.selections, groups);
      } catch (error) {
        selectionError(error);
      }
      if (validated.selectionKey !== item.selectionKey) {
        throw new OrderEngineError("SELECTION_KEY_MISMATCH", 400, "selectionKey does not match the validated selections.", {
          variantId: row.variant_id,
        });
      }

      const pricing = evaluateCatalogV2Pricing(customerIdentity, row);
      if (!pricing.canOrder || pricing.amount === null) {
        throw new OrderEngineError(pricing.reason || "VARIANT_NOT_ORDERABLE", 422, "Catalog variant cannot be ordered.", {
          variantId: row.variant_id,
        });
      }

      const quantity = Number(row.requested_quantity);
      const options = readOptions(row.options);
      const selectionSnapshot = {
        catalogProductId: row.catalog_product_id,
        variantId: row.variant_id,
        options,
        selections: validated.selections,
        selectionKey: validated.selectionKey,
        choiceGroups: groups.map((group) => ({ key: group.key, name: group.name, required: group.required })),
      };
      return {
        variantId: row.variant_id,
        sku: row.sku,
        name: row.name,
        unit: unitFromOptions(options),
        quantity,
        unitPrice: pricing.amount,
        lineTotal: money(pricing.amount * quantity),
        selections: validated.selections,
        selectionKey: validated.selectionKey,
        selectionSnapshot,
      };
    });

    const subtotal = money(snapshots.reduce((sum, item) => sum + item.lineTotal, 0));
    const orderResult = await client.query<{ id: string }>(
      `INSERT INTO orders (
         order_code, customer_id, status, subtotal, discount_total, total_amount,
         currency, submitted_at, idempotency_key, request_fingerprint
       ) VALUES ($1, $2, 'pending', $3, 0, $3, 'VND', now(), $4, $5)
       RETURNING id::text`,
      [createOrderCode(), customerIdentity.customerId, subtotal, input.idempotencyKey, fingerprint],
    );
    const orderId = orderResult.rows[0].id;

    for (const item of snapshots) {
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, variant_id, sku, name, product_name, unit, quantity,
           unit_price, line_total, total_price, product_type, bundle_snapshot,
           selection_snapshot, snapshot_version
         ) VALUES ($1, NULL, $2, $3, $4, $4, $5, $6, $7, $8, $8, 'physical', NULL, $9::jsonb, 2)`,
        [
          orderId,
          item.variantId,
          item.sku,
          item.name,
          item.unit,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          JSON.stringify(item.selectionSnapshot),
        ],
      );
    }

    await client.query(
      `INSERT INTO order_status_logs (
         order_id, from_status, to_status, actor_type, actor_id, note
       ) VALUES ($1, NULL, 'pending', 'customer', $2, 'Order created')`,
      [orderId, customerIdentity.clerkUserId],
    );

    const order = await loadOrder(client, orderId);
    await client.query("COMMIT");
    return { order, replayed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
