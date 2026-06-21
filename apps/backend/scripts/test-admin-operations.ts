import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express, { type Request } from "express";
import { getDb } from "../src/db/pool";
import type {
  CustomerIdentity,
  RequestIdentity,
  StaffIdentity,
} from "../src/modules/auth/auth.identity";
import { createAdminCustomersRouter } from "../src/modules/admin/admin-customers.routes";
import { createAdminOrdersRouter } from "../src/modules/orders/admin-orders.routes";
import { createOrder } from "../src/modules/orders/orders.service";

const db = getDb();

type SeedResult = {
  admin: StaffIdentity;
  staff: StaffIdentity;
  approvedCustomer: CustomerIdentity;
  pendingCustomerId: string;
  rejectedCustomerId: string;
  productId: string;
};

async function seed(): Promise<SeedResult> {
  await db.query(`
    TRUNCATE TABLE
      order_internal_note_logs,
      customer_approval_logs,
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
    VALUES ('ADMIN-PRICE', 'Admin Price', false)
    RETURNING id::text
  `);
  const priceGroupId = priceGroup.rows[0].id;

  const category = await db.query<{ id: string }>(`
    INSERT INTO categories (name, slug, sort_order, is_active)
    VALUES ('Admin Test', 'admin-test', 1, true)
    RETURNING id::text
  `);

  const product = await db.query<{ id: string }>(`
    INSERT INTO products (
      category_id, sku, name, slug, unit, unit_label,
      product_type, catalog_kind, base_price, wholesale_price,
      min_order_qty, status, is_active, is_public, is_orderable
    ) VALUES (
      $1, 'ADMIN-001', 'Admin Product', 'admin-product', 'Gói', 'Gói',
      'physical', 'sku_candidate', 12000, 10000,
      1, 'active', true, true, true
    ) RETURNING id::text
  `, [category.rows[0].id]);
  const productId = product.rows[0].id;

  await db.query(`
    INSERT INTO product_prices (product_id, price_group_id, price, min_quantity)
    VALUES ($1, $2, 9000, 1)
  `, [productId, priceGroupId]);

  const approved = await db.query<{ id: string }>(`
    INSERT INTO customers (
      name, shop_name, contact_name, phone,
      approval_status, status, price_group_id,
      approval_decided_by_actor_type, approval_decided_by_actor_id, approval_decided_at
    ) VALUES (
      'Approved Customer', 'Approved Shop', 'Anh Approved', '0900000001',
      'approved', 'active', $1,
      'system', 'admin-test-seed', now()
    ) RETURNING id::text
  `, [priceGroupId]);
  await db.query(`
    INSERT INTO customer_users (customer_id, clerk_user_id, role, is_primary)
    VALUES ($1, 'clerk-admin-approved-customer', 'owner', true)
  `, [approved.rows[0].id]);

  const pending = await db.query<{ id: string }>(`
    INSERT INTO customers (
      name, shop_name, contact_name, phone, approval_status, status
    ) VALUES (
      'Pending Customer', 'Pending Shop', 'Chị Pending', '0900000002', 'pending', 'active'
    ) RETURNING id::text
  `);

  const rejected = await db.query<{ id: string }>(`
    INSERT INTO customers (
      name, shop_name, approval_status, status,
      approval_decided_by_actor_type, approval_decided_by_actor_id,
      approval_decided_at, approval_note, rejected_reason
    ) VALUES (
      'Rejected Customer', 'Rejected Shop', 'rejected', 'active',
      'system', 'admin-test-seed', now(), 'Seed rejection', 'Seed rejection'
    ) RETURNING id::text
  `);

  const admin = await db.query<{ id: string }>(`
    INSERT INTO staff_users (clerk_user_id, email, name, role, is_active)
    VALUES ('clerk-phase5-admin', 'admin@bepsi.test', 'Phase 5 Admin', 'admin', true)
    RETURNING id::text
  `);
  const staff = await db.query<{ id: string }>(`
    INSERT INTO staff_users (clerk_user_id, email, name, role, is_active)
    VALUES ('clerk-phase5-staff', 'staff@bepsi.test', 'Phase 5 Staff', 'staff', true)
    RETURNING id::text
  `);

  return {
    admin: {
      kind: "staff",
      clerkUserId: "clerk-phase5-admin",
      staffId: admin.rows[0].id,
      role: "admin",
      isActive: true,
    },
    staff: {
      kind: "staff",
      clerkUserId: "clerk-phase5-staff",
      staffId: staff.rows[0].id,
      role: "staff",
      isActive: true,
    },
    approvedCustomer: {
      kind: "customer",
      clerkUserId: "clerk-admin-approved-customer",
      customerId: approved.rows[0].id,
      customerUserRole: "owner",
      approvalStatus: "approved",
      accountStatus: "active",
      priceGroupId,
    },
    pendingCustomerId: pending.rows[0].id,
    rejectedCustomerId: rejected.rows[0].id,
    productId,
  };
}

function resolver(seedData: SeedResult) {
  return async (req: Request): Promise<RequestIdentity> => {
    switch (req.header("x-test-identity")) {
      case "admin":
        return seedData.admin;
      case "staff":
        return seedData.staff;
      case "customer":
        return seedData.approvedCustomer;
      default:
        return { kind: "anonymous", clerkUserId: null };
    }
  };
}

async function startServer(seedData: SeedResult) {
  const app = express();
  app.use(express.json());
  const identityResolver = resolver(seedData);
  app.use("/api/admin/customers", createAdminCustomersRouter(identityResolver));
  app.use("/api/admin/orders", createAdminOrdersRouter(identityResolver));

  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Admin test server listen timeout")), 5000);
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
  options: { method?: string; identity?: string; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.identity ? { "x-test-identity": options.identity } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const raw = await response.text();
  assert.equal(response.headers.get("content-type")?.includes("application/json"), true, raw);
  return { status: response.status, body: JSON.parse(raw), raw };
}

async function createTestOrder(seedData: SeedResult, key: string) {
  const result = await createOrder({
    identity: seedData.approvedCustomer,
    idempotencyKey: key,
    items: [{ productId: seedData.productId, quantity: 2 }],
  });
  return result.order.id as string;
}

async function main() {
  const seedData = await seed();
  const { server, baseUrl } = await startServer(seedData);

  try {
    const customerDenied = await requestJson(baseUrl, "/api/admin/customers", {
      identity: "customer",
    });
    assert.equal(customerDenied.status, 403);
    assert.equal(customerDenied.body.error, "ADMIN_ACCESS_REQUIRED");

    const staffDenied = await requestJson(baseUrl, "/api/admin/orders", {
      identity: "staff",
    });
    assert.equal(staffDenied.status, 403);
    assert.equal(staffDenied.body.error, "ADMIN_ACCESS_REQUIRED");

    const pendingList = await requestJson(
      baseUrl,
      "/api/admin/customers?approvalStatus=pending",
      { identity: "admin" },
    );
    assert.equal(pendingList.status, 200);
    assert.equal(pendingList.body.total, 1);
    assert.equal(pendingList.body.customers[0].id, seedData.pendingCustomerId);

    const pendingDetail = await requestJson(
      baseUrl,
      `/api/admin/customers/${seedData.pendingCustomerId}`,
      { identity: "admin" },
    );
    assert.equal(pendingDetail.status, 200);
    assert.equal(pendingDetail.body.customer.approvalStatus, "pending");
    assert.deepEqual(pendingDetail.body.customer.approvalLogs, []);

    const approved = await requestJson(
      baseUrl,
      `/api/admin/customers/${seedData.pendingCustomerId}/approval`,
      {
        method: "PATCH",
        identity: "admin",
        body: { status: "approved", note: "Hồ sơ hợp lệ" },
      },
    );
    assert.equal(approved.status, 200);
    assert.equal(approved.body.customer.approvalStatus, "approved");
    assert.equal(approved.body.customer.approvalActorId, seedData.admin.clerkUserId);
    assert.ok(approved.body.customer.approvalDecidedAt);
    assert.equal(approved.body.customer.approvalLogs[0].fromStatus, "pending");
    assert.equal(approved.body.customer.approvalLogs[0].toStatus, "approved");
    assert.equal(approved.body.customer.approvalLogs[0].actorId, seedData.admin.clerkUserId);
    assert.equal(approved.body.customer.approvalLogs[0].note, "Hồ sơ hợp lệ");
    assert.ok(approved.body.customer.approvalLogs[0].createdAt);

    const rejectedAgain = await requestJson(
      baseUrl,
      `/api/admin/customers/${seedData.pendingCustomerId}/approval`,
      {
        method: "PATCH",
        identity: "admin",
        body: { status: "rejected", note: "Thiếu giấy phép kinh doanh" },
      },
    );
    assert.equal(rejectedAgain.status, 200);
    assert.equal(rejectedAgain.body.customer.approvalStatus, "rejected");
    assert.equal(rejectedAgain.body.customer.approvalLogs.length, 2);
    assert.equal(rejectedAgain.body.customer.approvalLogs[0].fromStatus, "approved");
    assert.equal(rejectedAgain.body.customer.approvalLogs[0].toStatus, "rejected");

    const missingRejectReason = await requestJson(
      baseUrl,
      `/api/admin/customers/${seedData.rejectedCustomerId}/approval`,
      {
        method: "PATCH",
        identity: "admin",
        body: { status: "approved", note: "Đã bổ sung" },
      },
    );
    assert.equal(missingRejectReason.status, 200);
    assert.equal(missingRejectReason.body.customer.approvalStatus, "approved");

    const orderId = await createTestOrder(seedData, "phase5-admin-order-0001");
    const orderList = await requestJson(baseUrl, "/api/admin/orders", { identity: "admin" });
    assert.equal(orderList.status, 200);
    assert.ok(orderList.body.orders.some((order: any) => order.id === orderId));

    const orderDetail = await requestJson(baseUrl, `/api/admin/orders/${orderId}`, {
      identity: "admin",
    });
    assert.equal(orderDetail.status, 200);
    assert.equal(orderDetail.body.order.customerId, seedData.approvedCustomer.customerId);
    assert.equal(orderDetail.body.order.items.length, 1);
    assert.equal(orderDetail.body.order.statusLogs.length, 1);
    assert.equal(orderDetail.body.order.statusLogs[0].fromStatus, null);
    assert.equal(orderDetail.body.order.statusLogs[0].toStatus, "pending");
    assert.equal(orderDetail.body.order.statusLogs[0].actorType, "customer");
    assert.ok(orderDetail.body.order.statusLogs[0].createdAt);

    const noteUpdated = await requestJson(
      baseUrl,
      `/api/admin/orders/${orderId}/internal-note`,
      {
        method: "PATCH",
        identity: "admin",
        body: { note: "Gọi xác nhận trước khi giao" },
      },
    );
    assert.equal(noteUpdated.status, 200);
    assert.equal(noteUpdated.body.order.internalNote, "Gọi xác nhận trước khi giao");
    assert.equal(noteUpdated.body.order.internalNoteLogs.length, 1);
    assert.equal(noteUpdated.body.order.internalNoteLogs[0].actorId, seedData.admin.clerkUserId);
    assert.ok(noteUpdated.body.order.internalNoteLogs[0].createdAt);

    const confirmed = await requestJson(baseUrl, `/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      identity: "admin",
      body: { status: "confirmed", note: "Đã xác nhận tồn kho" },
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.order.status, "confirmed");
    assert.equal(confirmed.body.order.statusLogs.length, 2);
    assert.equal(confirmed.body.order.statusLogs[1].fromStatus, "pending");
    assert.equal(confirmed.body.order.statusLogs[1].toStatus, "confirmed");
    assert.equal(confirmed.body.order.statusLogs[1].actorType, "staff");
    assert.equal(confirmed.body.order.statusLogs[1].actorId, seedData.admin.clerkUserId);
    assert.equal(confirmed.body.order.statusLogs[1].note, "Đã xác nhận tồn kho");
    assert.ok(confirmed.body.order.statusLogs[1].createdAt);

    const invalidTransition = await requestJson(baseUrl, `/api/admin/orders/${orderId}/status`, {
      method: "PATCH",
      identity: "admin",
      body: { status: "completed" },
    });
    assert.equal(invalidTransition.status, 409);
    assert.equal(invalidTransition.body.error, "INVALID_ORDER_STATUS_TRANSITION");

    const rollbackOrderId = await createTestOrder(seedData, "phase5-admin-order-rollback");
    await db.query(`
      CREATE OR REPLACE FUNCTION fail_phase5_status_log()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.order_id = '${rollbackOrderId}'::uuid AND NEW.to_status = 'confirmed' THEN
          RAISE EXCEPTION 'forced status log failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER phase5_status_log_failure
      BEFORE INSERT ON order_status_logs
      FOR EACH ROW EXECUTE FUNCTION fail_phase5_status_log();
    `);

    try {
      const failedTransition = await requestJson(
        baseUrl,
        `/api/admin/orders/${rollbackOrderId}/status`,
        {
          method: "PATCH",
          identity: "admin",
          body: { status: "confirmed", note: "Must rollback" },
        },
      );
      assert.equal(failedTransition.status, 500);

      const rollbackState = await db.query<{ status: string; log_count: number }>(`
        SELECT
          orders.status,
          COUNT(log.id)::int AS log_count
        FROM orders
        LEFT JOIN order_status_logs log ON log.order_id = orders.id
        WHERE orders.id = $1
        GROUP BY orders.id
      `, [rollbackOrderId]);
      assert.deepEqual(rollbackState.rows[0], { status: "pending", log_count: 1 });
    } finally {
      await db.query("DROP TRIGGER IF EXISTS phase5_status_log_failure ON order_status_logs");
      await db.query("DROP FUNCTION IF EXISTS fail_phase5_status_log()");
    }

    console.log("Admin operations integration tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.end();
  }
}

main().catch(async (error) => {
  console.error("Admin operations integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
