import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express, { type Request } from "express";
import { getDb } from "../src/db/pool";
import {
  anonymousIdentity,
  resolveIdentityByClerkUserId,
  type RequestIdentity,
} from "../src/modules/auth/auth.identity";
import { createAuthRouter } from "../src/modules/auth/auth.routes";
import { createCatalogRouter } from "../src/modules/catalog/catalog.routes";
import { validateOrderProductAccess } from "../src/modules/catalog/order-access";

const db = getDb();

async function seed() {
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

  const group = await db.query<{ id: string }>(`
    INSERT INTO price_groups (code, name, is_default)
    VALUES ('VIP', 'VIP', false)
    RETURNING id::text
  `);
  const priceGroupId = group.rows[0].id;

  const category = await db.query<{ id: string }>(`
    INSERT INTO categories (name, slug, sort_order, is_active)
    VALUES ('Trà sữa pha chế', 'tra-sua-pha-che', 1, true)
    RETURNING id::text
  `);
  const categoryId = category.rows[0].id;

  const product = await db.query<{ id: string }>(`
    INSERT INTO products (
      category_id, sku, name, slug, unit, unit_label,
      product_type, catalog_kind, base_price, wholesale_price,
      min_order_qty, status, is_active, is_public, is_orderable
    ) VALUES (
      $1, 'P2-001', 'Phase 2 Product', 'phase-2-product', 'gói', 'Gói',
      'physical', 'sku_candidate', 12000, 10000,
      1, 'active', true, true, true
    ) RETURNING id::text
  `, [categoryId]);
  const productId = product.rows[0].id;

  await db.query(`
    INSERT INTO product_prices (product_id, price_group_id, price, min_quantity)
    VALUES ($1, $2, 9000, 1)
  `, [productId, priceGroupId]);

  const approved = await db.query<{ id: string }>(`
    INSERT INTO customers (
      name, approval_status, status, price_group_id,
      approval_decided_by_actor_type, approval_decided_by_actor_id, approval_decided_at
    ) VALUES ('Approved', 'approved', 'active', $1, 'system', 'test', now())
    RETURNING id::text
  `, [priceGroupId]);
  await db.query(`
    INSERT INTO customer_users (customer_id, clerk_user_id, role, is_primary)
    VALUES ($1, 'clerk-approved', 'owner', true)
  `, [approved.rows[0].id]);

  await db.query(`
    INSERT INTO customers (clerk_user_id, name, approval_status, status)
    VALUES ('clerk-pending', 'Pending', 'pending', 'active')
  `);

  await db.query(`
    INSERT INTO customers (
      clerk_user_id, name, approval_status, status,
      approval_decided_by_actor_type, approval_decided_by_actor_id, approval_decided_at
    ) VALUES ('clerk-rejected', 'Rejected', 'rejected', 'active', 'system', 'test', now())
  `);

  return { productId };
}

async function identityResolver(req: Request): Promise<RequestIdentity> {
  const clerkUserId = req.header("x-test-clerk-user-id");
  return clerkUserId ? resolveIdentityByClerkUserId(clerkUserId) : anonymousIdentity;
}

async function requestJson(
  baseUrl: string,
  path: string,
  clerkUserId?: string,
): Promise<{ status: number; body: any; raw: string }> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: clerkUserId
      ? {
          "x-test-clerk-user-id": clerkUserId,
          "x-approval-status": "approved",
        }
      : undefined,
  });
  const raw = await response.text();
  return { status: response.status, body: JSON.parse(raw), raw };
}

function assertHiddenPrice(result: { body: any; raw: string }, reason: string) {
  assert.equal(result.body.products?.[0]?.pricing?.visibility ?? result.body.product?.pricing?.visibility, "hidden");
  assert.equal(result.body.products?.[0]?.pricing?.reason ?? result.body.product?.pricing?.reason, reason);
  assert.equal(result.raw.includes("wholesale_price"), false);
  assert.equal(result.raw.includes("base_price"), false);
  assert.equal(result.raw.includes('"amount"'), false);
}

async function main() {
  const { productId } = await seed();

  const approvedIdentity = await resolveIdentityByClerkUserId("clerk-approved");
  const pendingIdentity = await resolveIdentityByClerkUserId("clerk-pending");
  const rejectedIdentity = await resolveIdentityByClerkUserId("clerk-rejected");
  const unmappedIdentity = await resolveIdentityByClerkUserId("clerk-unmapped");

  assert.equal(approvedIdentity.kind, "customer");
  assert.equal(approvedIdentity.kind === "customer" && approvedIdentity.approvalStatus, "approved");
  assert.equal(pendingIdentity.kind === "customer" && pendingIdentity.approvalStatus, "pending");
  assert.equal(rejectedIdentity.kind === "customer" && rejectedIdentity.approvalStatus, "rejected");
  assert.equal(unmappedIdentity.kind, "unmapped");

  const app = express();
  app.use("/api/catalog", createCatalogRouter(identityResolver));
  app.use("/api/auth", createAuthRouter(identityResolver));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const publicList = await requestJson(baseUrl, "/api/catalog/products");
    assert.equal(publicList.status, 200);
    assertHiddenPrice(publicList, "AUTH_REQUIRED");

    const pendingList = await requestJson(
      baseUrl,
      "/api/catalog/products?approvalStatus=approved&wholesale_price=true",
      "clerk-pending",
    );
    assertHiddenPrice(pendingList, "CUSTOMER_PENDING");
    assert.equal(pendingList.body.products[0].isOrderable, false);

    const rejectedDetail = await requestJson(
      baseUrl,
      "/api/catalog/products/phase-2-product?approvalStatus=approved",
      "clerk-rejected",
    );
    assertHiddenPrice(rejectedDetail, "CUSTOMER_REJECTED");

    const approvedList = await requestJson(baseUrl, "/api/catalog/products", "clerk-approved");
    assert.equal(approvedList.body.products[0].pricing.visibility, "visible");
    assert.equal(approvedList.body.products[0].pricing.amount, 9000);
    assert.equal(approvedList.body.products[0].pricing.source, "price_group");
    assert.equal(approvedList.body.products[0].isOrderable, true);

    const approvedDetail = await requestJson(
      baseUrl,
      "/api/catalog/products/phase-2-product",
      "clerk-approved",
    );
    assert.deepEqual(approvedDetail.body.product.pricing, approvedList.body.products[0].pricing);

    const pendingMe = await requestJson(baseUrl, "/api/auth/me", "clerk-pending");
    assert.equal(pendingMe.body.approvalStatus, "pending");
    assert.equal(pendingMe.body.canViewWholesalePrice, false);
    assert.equal(pendingMe.body.canPlaceOrder, false);

    const approvedMe = await requestJson(baseUrl, "/api/auth/me", "clerk-approved");
    assert.equal(approvedMe.body.canViewWholesalePrice, true);
    assert.equal(approvedMe.body.canPlaceOrder, true);

    const orderProduct = {
      sku: "P2-001",
      unitLabel: "Gói",
      productType: "physical" as const,
      isOrderable: true,
      isActive: true,
      isPublic: true,
      bundleItemCount: 0,
      basePrice: 12000,
      wholesalePrice: 10000,
      priceGroupPrice: 9000,
    };
    assert.deepEqual(validateOrderProductAccess(pendingIdentity, orderProduct), {
      allowed: false,
      code: "CUSTOMER_PENDING",
    });
    assert.deepEqual(validateOrderProductAccess(rejectedIdentity, orderProduct), {
      allowed: false,
      code: "CUSTOMER_REJECTED",
    });
    assert.deepEqual(validateOrderProductAccess(approvedIdentity, orderProduct), {
      allowed: true,
      unitPrice: 9000,
      currency: "VND",
      priceSource: "price_group",
    });

    const productExists = await db.query("SELECT 1 FROM products WHERE id = $1", [productId]);
    assert.equal(productExists.rowCount, 1);
    console.log("Auth and pricing policy integration tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.end();
  }
}

main().catch(async (error) => {
  console.error("Auth and pricing policy integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
