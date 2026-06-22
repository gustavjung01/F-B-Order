import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express, { type Request } from "express";
import { getDb } from "../src/db/pool";
import { createAdminCustomersRouter } from "../src/modules/admin/admin-customers.routes";
import { createAuthRouter } from "../src/modules/auth/auth.routes";
import {
  anonymousIdentity,
  resolveIdentityByClerkUserId,
  type RequestIdentity,
} from "../src/modules/auth/auth.identity";
import { createCartRouter } from "../src/modules/catalog/cart.routes";
import { createAdminOrdersRouter } from "../src/modules/orders/admin-orders.routes";
import { createOrdersRouter } from "../src/modules/orders/orders.routes";

const ADMIN_CLERK_ID = "user_phase72_admin";
const CUSTOMER_A_CLERK_ID = "user_phase72_customer_a";
const CUSTOMER_B_CLERK_ID = "user_phase72_customer_b";
const UNMAPPED_CLERK_ID = "user_phase72_unmapped";
const PRODUCT_SKU = "PHASE72-SMOKE-001";

const db = getDb();

type JsonRecord = Record<string, any>;

async function resetIntegrationData(): Promise<void> {
  await db.query(`
    TRUNCATE TABLE
      order_internal_note_logs,
      customer_approval_logs,
      order_status_logs,
      order_items,
      orders,
      cart_items,
      carts,
      customer_users,
      customers,
      staff_users
    RESTART IDENTITY CASCADE
  `);
}

async function seedAdmin(): Promise<void> {
  await db.query(
    `INSERT INTO staff_users (
       clerk_user_id,
       email,
       name,
       role,
       is_active
     )
     VALUES ($1, $2, $3, 'admin', true)`,
    [
      ADMIN_CLERK_ID,
      "admin-phase72@test.local",
      "Phase 7.2 Admin",
    ],
  );
}

async function resolveTestIdentity(req: Request): Promise<RequestIdentity> {
  const testUser = req.header("x-test-user");

  if (!testUser || testUser === "anonymous") {
    return anonymousIdentity;
  }

  const clerkUserId =
    testUser === "admin"
      ? ADMIN_CLERK_ID
      : testUser === "customer-a"
        ? CUSTOMER_A_CLERK_ID
        : testUser === "customer-b"
          ? CUSTOMER_B_CLERK_ID
          : UNMAPPED_CLERK_ID;

  return resolveIdentityByClerkUserId(clerkUserId, db);
}

async function main(): Promise<void> {
  await resetIntegrationData();
  await seedAdmin();

  const productResult = await db.query<{ id: string }>(
    `SELECT id::text
     FROM products
     WHERE sku = $1
       AND status = 'active'
       AND is_active = true
       AND is_public = true
       AND is_orderable = true
     LIMIT 1`,
    [PRODUCT_SKU],
  );

  const productId = productResult.rows[0]?.id;

  assert.ok(
    productId,
    `Smoke product ${PRODUCT_SKU} is missing or not orderable.`,
  );

  const app = express();
  app.use(express.json());

  app.use("/api/auth", createAuthRouter(resolveTestIdentity));
  app.use("/api/cart", createCartRouter(resolveTestIdentity));
  app.use("/api/orders", createOrdersRouter(resolveTestIdentity));
  app.use(
    "/api/admin/customers",
    createAdminCustomersRouter(resolveTestIdentity),
  );
  app.use(
    "/api/admin/orders",
    createAdminOrdersRouter(resolveTestIdentity),
  );

  const server = app.listen(0, "127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }

    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(
    path: string,
    options: {
      method?: string;
      user?: string;
      body?: JsonRecord;
      idempotencyKey?: string;
    } = {},
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (options.user) {
      headers["x-test-user"] = options.user;
    }

    if (options.idempotencyKey) {
      headers["idempotency-key"] = options.idempotencyKey;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;

    return {
      status: response.status,
      body,
    };
  }

  try {
    /*
     * Unauthorized flow
     */
    const anonymousMe = await request("/api/auth/me");
    assert.equal(anonymousMe.status, 401);
    assert.equal(anonymousMe.body.error, "AUTH_REQUIRED");

    const anonymousOrder = await request("/api/orders", {
      method: "POST",
      idempotencyKey: "phase72-anonymous-order",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });
    assert.equal(anonymousOrder.status, 401);
    assert.equal(anonymousOrder.body.error, "AUTH_REQUIRED");

    const anonymousAdmin = await request("/api/admin/customers");
    assert.equal(anonymousAdmin.status, 401);
    assert.equal(anonymousAdmin.body.error, "AUTH_REQUIRED");

    const unmappedOrder = await request("/api/orders", {
      method: "POST",
      user: "unmapped",
      idempotencyKey: "phase72-unmapped-order",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });
    assert.equal(unmappedOrder.status, 403);
    assert.equal(
      unmappedOrder.body.error,
      "CUSTOMER_PROFILE_REQUIRED",
    );

    /*
     * Customer A: pending -> approved -> order
     */
    const customerACreated = await request(
      "/api/auth/customer-profile",
      {
        method: "POST",
        user: "customer-a",
        body: {
          name: "Phase 7.2 Customer A",
          shopName: "Phase 7.2 Shop A",
          contactName: "Khách A",
          phone: "0900007201",
          address: "Địa chỉ integration A",
          area: "TP.HCM",
          businessType: "quán trà sữa",
        },
      },
    );

    assert.equal(customerACreated.status, 201);
    assert.equal(
      customerACreated.body.customer.approvalStatus,
      "pending",
    );

    const customerAId = customerACreated.body.customer.id as string;
    assert.ok(customerAId);

    const customerAMePending = await request("/api/auth/me", {
      user: "customer-a",
    });

    assert.equal(customerAMePending.status, 200);
    assert.equal(
      customerAMePending.body.identityKind,
      "customer",
    );
    assert.equal(
      customerAMePending.body.approvalStatus,
      "pending",
    );
    assert.equal(
      customerAMePending.body.canViewWholesalePrice,
      false,
    );
    assert.equal(customerAMePending.body.canPlaceOrder, false);

    const pendingCart = await request("/api/cart/validate", {
      method: "POST",
      user: "customer-a",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });

    assert.equal(pendingCart.status, 200);
    assert.equal(pendingCart.body.canCheckout, false);
    assert.equal(pendingCart.body.totalPreview, null);
    assert.equal(
      pendingCart.body.items[0].product.pricing.visibility,
      "hidden",
    );

    const pendingOrder = await request("/api/orders", {
      method: "POST",
      user: "customer-a",
      idempotencyKey: "phase72-customer-a-pending",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });

    assert.equal(pendingOrder.status, 403);
    assert.equal(pendingOrder.body.error, "CUSTOMER_PENDING");

    const pendingCustomers = await request(
      "/api/admin/customers?approvalStatus=pending",
      {
        user: "admin",
      },
    );

    assert.equal(pendingCustomers.status, 200);
    assert.equal(
      pendingCustomers.body.customers.some(
        (customer: JsonRecord) => customer.id === customerAId,
      ),
      true,
    );

    const approvedCustomer = await request(
      `/api/admin/customers/${customerAId}/approval`,
      {
        method: "PATCH",
        user: "admin",
        body: {
          status: "approved",
          note: "Approved in Phase 7.2 integration test.",
        },
      },
    );

    assert.equal(approvedCustomer.status, 200);
    assert.equal(
      approvedCustomer.body.customer.approvalStatus,
      "approved",
    );
    assert.equal(
      approvedCustomer.body.customer.approvalLogs.some(
        (log: JsonRecord) =>
          log.fromStatus === "pending" &&
          log.toStatus === "approved" &&
          log.actorType === "staff",
      ),
      true,
    );

    const customerAMeApproved = await request("/api/auth/me", {
      user: "customer-a",
    });

    assert.equal(
      customerAMeApproved.body.approvalStatus,
      "approved",
    );
    assert.equal(
      customerAMeApproved.body.canViewWholesalePrice,
      true,
    );
    assert.equal(customerAMeApproved.body.canPlaceOrder, true);

    const approvedCart = await request("/api/cart/validate", {
      method: "POST",
      user: "customer-a",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });

    assert.equal(approvedCart.status, 200);
    assert.equal(approvedCart.body.canCheckout, true);
    assert.equal(approvedCart.body.totalPreview, 10000);
    assert.equal(
      approvedCart.body.items[0].product.pricing.visibility,
      "visible",
    );
    assert.equal(
      approvedCart.body.items[0].product.pricing.amount,
      10000,
    );
    assert.equal(approvedCart.body.items[0].lineTotal, 10000);

    const createdOrder = await request("/api/orders", {
      method: "POST",
      user: "customer-a",
      idempotencyKey: "phase72-customer-a-order-0001",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });

    assert.equal(createdOrder.status, 201);
    assert.equal(createdOrder.body.replayed, false);
    assert.equal(createdOrder.body.order.status, "pending");
    assert.equal(createdOrder.body.order.totalAmount, 10000);

    const orderId = createdOrder.body.order.id as string;
    assert.ok(orderId);

    const adminOrders = await request("/api/admin/orders", {
      user: "admin",
    });

    assert.equal(adminOrders.status, 200);
    assert.equal(
      adminOrders.body.orders.some(
        (order: JsonRecord) => order.id === orderId,
      ),
      true,
    );

    const customerAdminAccess = await request(
      "/api/admin/customers",
      {
        user: "customer-a",
      },
    );

    assert.equal(customerAdminAccess.status, 403);
    assert.equal(
      customerAdminAccess.body.error,
      "ADMIN_ACCESS_REQUIRED",
    );

    const confirmedOrder = await request(
      `/api/admin/orders/${orderId}/status`,
      {
        method: "PATCH",
        user: "admin",
        body: {
          status: "confirmed",
          note: "Confirmed in Phase 7.2 integration test.",
        },
      },
    );

    assert.equal(confirmedOrder.status, 200);
    assert.equal(confirmedOrder.body.order.status, "confirmed");

    assert.equal(
      confirmedOrder.body.order.statusLogs.some(
        (log: JsonRecord) =>
          log.fromStatus === "pending" &&
          log.toStatus === "confirmed" &&
          log.actorType === "staff",
      ),
      true,
    );

    /*
     * Customer B: pending -> rejected
     */
    const customerBCreated = await request(
      "/api/auth/customer-profile",
      {
        method: "POST",
        user: "customer-b",
        body: {
          name: "Phase 7.2 Customer B",
          shopName: "Phase 7.2 Shop B",
          contactName: "Khách B",
          phone: "0900007202",
          address: "Địa chỉ integration B",
          area: "Hà Nội",
          businessType: "quán cà phê",
        },
      },
    );

    assert.equal(customerBCreated.status, 201);

    const customerBId = customerBCreated.body.customer.id as string;
    assert.ok(customerBId);

    const rejectedCustomer = await request(
      `/api/admin/customers/${customerBId}/approval`,
      {
        method: "PATCH",
        user: "admin",
        body: {
          status: "rejected",
          note: "Thiếu thông tin xác minh Phase 7.2.",
        },
      },
    );

    assert.equal(rejectedCustomer.status, 200);
    assert.equal(
      rejectedCustomer.body.customer.approvalStatus,
      "rejected",
    );
    assert.equal(
      rejectedCustomer.body.customer.rejectedReason,
      "Thiếu thông tin xác minh Phase 7.2.",
    );
    assert.equal(
      rejectedCustomer.body.customer.approvalLogs.some(
        (log: JsonRecord) =>
          log.fromStatus === "pending" &&
          log.toStatus === "rejected" &&
          log.actorType === "staff",
      ),
      true,
    );

    const customerBMe = await request("/api/auth/me", {
      user: "customer-b",
    });

    assert.equal(customerBMe.status, 200);
    assert.equal(customerBMe.body.approvalStatus, "rejected");
    assert.equal(customerBMe.body.canViewWholesalePrice, false);
    assert.equal(customerBMe.body.canPlaceOrder, false);

    const rejectedCart = await request("/api/cart/validate", {
      method: "POST",
      user: "customer-b",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });

    assert.equal(rejectedCart.status, 200);
    assert.equal(rejectedCart.body.canCheckout, false);
    assert.equal(rejectedCart.body.totalPreview, null);
    assert.equal(
      rejectedCart.body.items[0].product.pricing.visibility,
      "hidden",
    );

    const rejectedOrder = await request("/api/orders", {
      method: "POST",
      user: "customer-b",
      idempotencyKey: "phase72-customer-b-rejected",
      body: {
        items: [{ productId, quantity: 1 }],
      },
    });

    assert.equal(rejectedOrder.status, 403);
    assert.equal(rejectedOrder.body.error, "CUSTOMER_REJECTED");

    console.log("Phase 7.2 full integration tests passed.");
    console.log(`Approved customer: ${customerAId}`);
    console.log(`Rejected customer: ${customerBId}`);
    console.log(`Created order: ${orderId}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await db.end();
  }
}

main().catch(async (error) => {
  console.error("Phase 7.2 full integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});