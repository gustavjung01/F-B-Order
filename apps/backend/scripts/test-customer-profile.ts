import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { getDb } from "../src/db/pool";
import {
  anonymousIdentity,
  resolveIdentityByClerkUserId,
  type RequestIdentity,
} from "../src/modules/auth/auth.identity";
import { createAuthRouter } from "../src/modules/auth/auth.routes";

const TEST_CLERK_USER_ID = "user_phase72_customer_profile";
const db = getDb();

async function cleanTestCustomer(): Promise<void> {
  await db.query(
    "DELETE FROM customers WHERE clerk_user_id = $1",
    [TEST_CLERK_USER_ID],
  );
}

async function identityResolver(req: express.Request): Promise<RequestIdentity> {
  const mode = req.header("x-test-identity");

  if (mode === "anonymous") {
    return anonymousIdentity;
  }

  if (mode === "staff") {
    return {
      kind: "staff",
      clerkUserId: "user_phase72_staff",
      staffId: "00000000-0000-4000-8000-000000000001",
      role: "admin",
      isActive: true,
    };
  }

  if (mode === "resolved") {
    return resolveIdentityByClerkUserId(TEST_CLERK_USER_ID, db);
  }

  return {
    kind: "unmapped",
    clerkUserId: TEST_CLERK_USER_ID,
  };
}

async function main(): Promise<void> {
  await cleanTestCustomer();

  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(identityResolver));

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
      identity?: string;
      body?: Record<string, unknown>;
    } = {},
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.identity
          ? { "x-test-identity": options.identity }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const body = await response.json() as any;

    return {
      status: response.status,
      body,
    };
  }

  try {
    const anonymous = await request("/api/auth/customer-profile", {
      method: "POST",
      identity: "anonymous",
      body: {
        name: "Anonymous",
        phone: "0900000000",
      },
    });

    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error, "AUTH_REQUIRED");

    const invalid = await request("/api/auth/customer-profile", {
      method: "POST",
      identity: "unmapped",
      body: {
        name: "Phase 7.2 Customer",
      },
    });

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "INVALID_CUSTOMER_PROFILE");

    const created = await request("/api/auth/customer-profile", {
      method: "POST",
      identity: "unmapped",
      body: {
        name: "Phase 7.2 Customer",
        shopName: "Phase 7.2 Shop",
        contactName: "Nguyễn Văn Test",
        phone: "0900000072",
        address: "Địa chỉ integration test",
        area: "TP.HCM",
        businessType: "quán trà sữa",

        // Các trường nguy hiểm này phải bị backend bỏ qua.
        approvalStatus: "approved",
        priceGroupId: "00000000-0000-4000-8000-000000000099",
        role: "admin",
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.customer.approvalStatus, "pending");
    assert.equal(created.body.customer.accountStatus, "active");
    assert.equal(created.body.canViewWholesalePrice, false);
    assert.equal(created.body.canPlaceOrder, false);

    const me = await request("/api/auth/me", {
      identity: "resolved",
    });

    assert.equal(me.status, 200);
    assert.equal(me.body.identityKind, "customer");
    assert.equal(me.body.approvalStatus, "pending");
    assert.equal(me.body.accountStatus, "active");
    assert.equal(me.body.customerUserRole, "owner");
    assert.equal(me.body.canViewWholesalePrice, false);
    assert.equal(me.body.canPlaceOrder, false);

    const stored = await db.query<{
      approval_status: string;
      account_status: string;
      price_group_id: string | null;
      role: string;
      is_primary: boolean;
    }>(
      `SELECT
         customer.approval_status,
         customer.status AS account_status,
         customer.price_group_id::text,
         customer_user.role,
         customer_user.is_primary
       FROM customers customer
       JOIN customer_users customer_user
         ON customer_user.customer_id = customer.id
       WHERE customer.clerk_user_id = $1`,
      [TEST_CLERK_USER_ID],
    );

    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].approval_status, "pending");
    assert.equal(stored.rows[0].account_status, "active");
    assert.equal(stored.rows[0].price_group_id, null);
    assert.equal(stored.rows[0].role, "owner");
    assert.equal(stored.rows[0].is_primary, true);

    const duplicate = await request("/api/auth/customer-profile", {
      method: "POST",
      identity: "unmapped",
      body: {
        name: "Duplicate Customer",
        phone: "0900000073",
      },
    });

    assert.equal(duplicate.status, 409);
    assert.equal(
      duplicate.body.error,
      "CUSTOMER_PROFILE_ALREADY_EXISTS",
    );

    const staff = await request("/api/auth/customer-profile", {
      method: "POST",
      identity: "staff",
      body: {
        name: "Staff Customer",
        phone: "0900000074",
      },
    });

    assert.equal(staff.status, 403);
    assert.equal(staff.body.error, "CUSTOMER_ACCESS_ONLY");

    console.log("Customer profile endpoint integration tests passed.");
  } finally {
    await cleanTestCustomer();

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
  console.error("Customer profile endpoint integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
