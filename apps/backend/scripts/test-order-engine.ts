import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express, { type Request } from "express";
import { getDb } from "../src/db/pool";
import type {
  CustomerIdentity,
  RequestIdentity,
  StaffIdentity,
} from "../src/modules/auth/auth.identity";
import { createAdminOrdersRouter } from "../src/modules/orders/admin-orders.routes";
import { createOrdersRouter } from "../src/modules/orders/orders.routes";
import { createOrder } from "../src/modules/orders/orders.service";

const db = getDb();

type SeedResult = {
  approved: CustomerIdentity;
  pending: CustomerIdentity;
  rejected: CustomerIdentity;
  staff: StaffIdentity;
  productId: string;
  blockedProductId: string;
};

async function seed(): Promise<SeedResult> {
  await db.query(`
    TRUNCATE TABLE
      order_status_logs,
      order_items,
      orders,
      cart_items,
      carts,
      product_prices,
      product_bundle_items,
      customer_users,
      staff_users,
      customers,
      products,
      categories,
      price_groups
    RESTART IDENTITY CASCADE
  `);

  const priceGroup = await db.query<{ id: string }>(`
    INSERT INTO price_groups (code, name, is_default)
    VALUES ('ORDER-VIP', 'Order VIP', false)
    RETURNING id::text
  `);
  const priceGroupId = priceGroup.rows[0].id;

  const category = await db.query<{ id: string }>(`
    INSERT INTO categories (name, slug, sort_order, is_active)
    VALUES ('Order Engine', 'order-engine', 1, true)
    RETURNING id::text
  `);
  const categoryId = category.rows[0].id;

  const product = await db.query<{ id: string }>(`
    INSERT INTO products (
      category_id,
      sku,
      name,
      slug,
      unit,
      unit_label,
      product_type,
      catalog_kind,
      base_price,
      wholesale_price,
      min_order_qty,
      status,
      is_active,
      is_public,
      is_orderable
    ) VALUES (
      $1,
      'ORDER-001',
      'Order Engine Product',
      'order-engine-product',
      'Gói',
      'Gói',
      'physical',
      'sku_candidate',
      12000,
      10000,
      2,
      'active',
      true,
      true,
      true
    ) RETURNING id::text
  `, [categoryId]);
  const productId = product.rows[0].id;

  const blockedProduct = await db.query<{ id: string }>(`
    INSERT INTO products (
      category_id,
      sku,
      name,
      slug,
      unit,
      unit_label,
      product_type,
      catalog_kind,
      base_price,
      wholesale_price,
      min_order_qty,
      status,
      is_active,
      is_public,
      is_orderable
    ) VALUES (
      $1,
      'ORDER-BLOCKED',
      'Blocked Product',
      'blocked-product',
      'Gói',
      'Gói',
      'physical',
      'sku_candidate',
      5000,
      4000,
      1,
      'active',
      true,
      true,
      false
    ) RETURNING id::text
  `, [categoryId]);

  await db.query(`
    INSERT INTO product_prices (product_id, price_group_id, price, min_quantity)
    VALUES ($1, $2, 9000, 2)
  `, [productId, priceGroupId]);

  const approvedCustomer = await db.query<{ id: string }>(`
    INSERT INTO customers (
      name,
      shop_name,
      approval_status,
      status,
      price_group_id,
      approval_decided_by_actor_type,
      approval_decided_by_actor_id,
      approval_decided_at
    ) VALUES (
      'Approved Customer',
      'Approved Shop',
      'approved',
      'active',
      $1,
      'system',
      'order-test',
      now()
    ) RETURNING id::text
  `, [priceGroupId]);
  const approvedCustomerId = approvedCustomer.rows[0].id;
  await db.query(`
    INSERT INTO customer_users (customer_id, clerk_user_id, role, is_primary)
    VALUES ($1, 'clerk-order-approved', 'owner', true)
  `, [approvedCustomerId]);

  const pendingCustomer = await db.query<{ id: string }>(`
    INSERT INTO customers (clerk_user_id, name, approval_status, status)
    VALUES ('clerk-order-pending', 'Pending Customer', 'pending', 'active')
    RETURNING id::text
  `);

  const rejectedCustomer = await db.query<{ id: string }>(`
    INSERT INTO customers (
      clerk_user_id,
      name,
      approval_status,
      status,
      approval_decided_by_actor_type,
      approval_decided_by_actor_id,
      approval_decided_at
    ) VALUES (
      'clerk-order-rejected',
      'Rejected Customer',
      'rejected',
      'active',
      'system',
      'order-test',
      now()
    ) RETURNING id::text
  `);

  const staff = await db.query<{ id: string }>(`
    INSERT INTO staff_users (clerk_user_id, email, name, role, is_active)
    VALUES ('clerk-order-admin', 'admin@example.test', 'Order Admin', 'admin', true)
    RETURNING id::text
  `);

  return {
    approved: {
      kind: "customer",
      clerkUserId: "clerk-order-approved",
      customerId: approvedCustomerId,
      customerUserRole: "owner",
      approvalStatus: "approved",
      accountStatus: "active",
      priceGroupId,
    },
    pending: {
      kind: "customer",
      clerkUserId: "clerk-order-pending",
      customerId: pendingCustomer.rows[0].id,
      customerUserRole: "customer",
      approvalStatus: "pending",
      accountStatus: "active",
      priceGroupId: null,
    },
    rejected: {
      kind: "customer",
      clerkUserId: "clerk-order-rejected",
      customerId: rejectedCustomer.rows[0].id,
      customerUserRole: "customer",
      approvalStatus: "rejected",
      accountStatus: "active",
      priceGroupId: null,
    },
    staff: {
      kind: "staff",
      clerkUserId: "clerk-order-admin",
      staffId: staff.rows[0].id,
      role: "admin",
      isActive: true,
    },
    productId,
    blockedProductId: blockedProduct.rows[0].id,
  };
}

function resolver(identities: SeedResult) {
  return async (req: Request): Promise<RequestIdentity> => {
    switch (req.header("x-test-identity")) {
      case "approved":
        return identities.approved;
      case "pending":
        return identities.pending;
      case "rejected":
        return identities.rejected;
      case "staff":
        return identities.staff;
      default:
        return { kind: "anonymous", clerkUserId: null };
    }
  };
}

async function startServer(identities: SeedResult) {
  const app = express();
  app.use(express.json());
  const identityResolver = resolver(identities);
  app.use("/api/orders", createOrdersRouter(identityResolver));
  app.use("/api/admin/orders", createAdminOrdersRouter(identityResolver));

  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Order test server listen timeout")), 5000);
    server.once("listening", () => {
      clearTimeout(timeout);
      resolve();
    });
    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function requestJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    identity?: string;
    idempotencyKey?: string;
    body?: unknown;
  } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.identity ? { "x-test-identity": options.identity } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("application/json"), true, raw);
  return { status: response.status, body: JSON.parse(raw), raw };
}

async function main() {
  const identities = await seed();
  const { server, baseUrl } = await startServer(identities);

  try {
    const emptyOrder = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "approved",
      idempotencyKey: "empty-order-key",
      body: { items: [] },
    });
    assert.equal(emptyOrder.status, 400);
    assert.equal(emptyOrder.body.error, "ORDER_ITEMS_REQUIRED");

    const pendingOrder = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "pending",
      idempotencyKey: "pending-order-key",
      body: { items: [{ productId: identities.productId, quantity: 2 }] },
    });
    assert.equal(pendingOrder.status, 403);
    assert.equal(pendingOrder.body.error, "CUSTOMER_PENDING");

    const rejectedOrder = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "rejected",
      idempotencyKey: "rejected-order-key",
      body: { items: [{ productId: identities.productId, quantity: 2 }] },
    });
    assert.equal(rejectedOrder.status, 403);
    assert.equal(rejectedOrder.body.error, "CUSTOMER_REJECTED");

    const belowMinimum = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "approved",
      idempotencyKey: "below-minimum-key",
      body: { items: [{ productId: identities.productId, quantity: 1 }] },
    });
    assert.equal(belowMinimum.status, 422);
    assert.equal(belowMinimum.body.error, "MINIMUM_ORDER_QUANTITY_NOT_MET");

    const blockedOrder = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "approved",
      idempotencyKey: "blocked-product-key",
      body: { items: [{ productId: identities.blockedProductId, quantity: 1 }] },
    });
    assert.equal(blockedOrder.status, 422);
    assert.equal(blockedOrder.body.error, "PRODUCT_NOT_ORDERABLE");

    const createPayload = {
      items: [
        {
          productId: identities.productId,
          quantity: 2,
          price: 1,
          productName: "Client Tampered Name",
          sku: "CLIENT-SKU",
          unit: "Client Unit",
          subtotal: 1,
          total: 1,
          status: "completed",
          approvalStatus: "approved",
        },
      ],
      subtotal: 1,
      total: 1,
      status: "completed",
      approvalStatus: "approved",
    };

    const created = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "approved",
      idempotencyKey: "approved-order-key-0001",
      body: createPayload,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.replayed, false);
    assert.equal(created.body.order.status, "pending");
    assert.equal(created.body.order.subtotal, 18000);
    assert.equal(created.body.order.totalAmount, 18000);
    assert.equal(created.body.order.items.length, 1);
    assert.equal(created.body.order.items[0].sku, "ORDER-001");
    assert.equal(created.body.order.items[0].name, "Order Engine Product");
    assert.equal(created.body.order.items[0].unit, "Gói");
    assert.equal(Number(created.body.order.items[0].unitPrice), 9000);
    assert.equal(Number(created.body.order.items[0].lineTotal), 18000);
    const orderId = created.body.order.id as string;

    const initialLog = await db.query<{
      from_status: string | null;
      to_status: string;
      actor_type: string;
      actor_id: string;
    }>(`
      SELECT from_status, to_status, actor_type, actor_id
      FROM order_status_logs
      WHERE order_id = $1
    `, [orderId]);
    assert.deepEqual(initialLog.rows, [
      {
        from_status: null,
        to_status: "pending",
        actor_type: "customer",
        actor_id: "clerk-order-approved",
      },
    ]);

    const replayed = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "approved",
      idempotencyKey: "approved-order-key-0001",
      body: createPayload,
    });
    assert.equal(replayed.status, 200);
    assert.equal(replayed.body.replayed, true);
    assert.equal(replayed.body.order.id, orderId);

    const conflictingReplay = await requestJson(baseUrl, "/api/orders", {
      method: "POST",
      identity: "approved",
      idempotencyKey: "approved-order-key-0001",
      body: { items: [{ productId: identities.productId, quantity: 3 }] },
    });
    assert.equal(conflictingReplay.status, 409);
    assert.equal(conflictingReplay.body.error, "IDEMPOTENCY_KEY_REUSED");

    const duplicateCount = await db.query<{ count: number }>(`
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE customer_id = $1
        AND idempotency_key = 'approved-order-key-0001'
    `, [identities.approved.customerId]);
    assert.equal(duplicateCount.rows[0].count, 1);

    await assert.rejects(
      createOrder(
        {
          identity: identities.approved,
          idempotencyKey: "forced-rollback-key",
          items: [{ productId: identities.productId, quantity: 2 }],
        },
        {
          db,
          hooks: {
            afterOrderInserted: () => {
              throw new Error("forced transaction failure");
            },
          },
        },
      ),
      /forced transaction failure/,
    );

    const rollbackState = await db.query<{
      orders: number;
      items: number;
      logs: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM orders WHERE idempotency_key = 'forced-rollback-key') AS orders,
        (SELECT COUNT(*)::int FROM order_items item JOIN orders ON orders.id = item.order_id WHERE orders.idempotency_key = 'forced-rollback-key') AS items,
        (SELECT COUNT(*)::int FROM order_status_logs log JOIN orders ON orders.id = log.order_id WHERE orders.idempotency_key = 'forced-rollback-key') AS logs
    `);
    assert.deepEqual(rollbackState.rows[0], { orders: 0, items: 0, logs: 0 });

    await db.query(`
      UPDATE products
      SET
        sku = 'ORDER-CHANGED',
        name = 'Changed Catalog Name',
        unit = 'Thùng',
        unit_label = 'Thùng',
        base_price = 999999,
        wholesale_price = 888888,
        updated_at = now()
      WHERE id = $1
    `, [identities.productId]);

    const snapshot = await db.query<{
      sku: string;
      name: string;
      unit: string;
      unit_price: number;
      line_total: number;
    }>(`
      SELECT
        sku,
        name,
        unit,
        unit_price::float8,
        line_total::float8
      FROM order_items
      WHERE order_id = $1
    `, [orderId]);
    assert.deepEqual(snapshot.rows[0], {
      sku: "ORDER-001",
      name: "Order Engine Product",
      unit: "Gói",
      unit_price: 9000,
      line_total: 18000,
    });

    const adminList = await requestJson(baseUrl, "/api/admin/orders", {
      identity: "staff",
    });
    assert.equal(adminList.status, 200);
    const adminOrder = adminList.body.orders.find((order: any) => order.id === orderId);
    assert.ok(adminOrder);
    assert.equal(adminOrder.itemCount, 1);
    assert.equal(adminOrder.totalAmount, 18000);

    const confirmed = await requestJson(baseUrl, `/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      identity: "staff",
      body: { status: "confirmed", note: "Stock confirmed" },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.order.status, "confirmed");

    const invalidJump = await requestJson(baseUrl, `/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      identity: "staff",
      body: { status: "completed" },
    });
    assert.equal(invalidJump.status, 409);
    assert.equal(invalidJump.body.error, "INVALID_ORDER_STATUS_TRANSITION");

    const statusAfterInvalidJump = await db.query<{ status: string; log_count: number }>(`
      SELECT
        orders.status,
        COUNT(log.id)::int AS log_count
      FROM orders
      LEFT JOIN order_status_logs log ON log.order_id = orders.id
      WHERE orders.id = $1
      GROUP BY orders.id
    `, [orderId]);
    assert.deepEqual(statusAfterInvalidJump.rows[0], { status: "confirmed", log_count: 2 });

    console.log("Order engine integration tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.end();
  }
}

main().catch(async (error) => {
  console.error("Order engine integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
