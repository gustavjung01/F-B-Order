import assert from "node:assert/strict";
import { getDb } from "../src/db/pool";
import type { CustomerIdentity, StaffIdentity } from "../src/modules/auth/auth.identity";
import { listAdminOrders } from "../src/modules/orders/orders.service";
import { createOrder } from "../src/modules/orders/orders.service";
import { validateCart } from "../src/modules/catalog/cart-validation.service";

const db = getDb();

async function main() {
  await db.query(`
    TRUNCATE TABLE
      order_internal_note_logs, customer_approval_logs, order_status_logs,
      order_items, orders, cart_items, carts, product_prices,
      product_bundle_items, customer_users, staff_users, customers,
      products, categories, price_groups
    RESTART IDENTITY CASCADE
  `);

  const group = await db.query<{ id: string }>(`
    INSERT INTO price_groups (code, name, is_default)
    VALUES ('CUTOVER', 'Cutover', false) RETURNING id::text
  `);
  const category = await db.query<{ id: string }>(`
    INSERT INTO categories (name, slug, sort_order, is_active)
    VALUES ('Cutover', 'cutover', 1, true) RETURNING id::text
  `);
  const product = await db.query<{ id: string }>(`
    INSERT INTO products (
      category_id, sku, name, slug, unit, unit_label,
      product_type, catalog_kind, base_price, wholesale_price,
      min_order_qty, status, is_active, is_public, is_orderable
    ) VALUES (
      $1, 'CUT-001', 'Cutover Product', 'cutover-product', 'Gói', 'Gói',
      'physical', 'sku_candidate', 12000, 10000,
      2, 'active', true, true, true
    ) RETURNING id::text
  `, [category.rows[0].id]);
  await db.query(`
    INSERT INTO product_prices (product_id, price_group_id, price, min_quantity)
    VALUES ($1, $2, 9000, 2)
  `, [product.rows[0].id, group.rows[0].id]);

  const approvedRow = await db.query<{ id: string }>(`
    INSERT INTO customers (
      name, approval_status, status, price_group_id,
      approval_decided_by_actor_type, approval_decided_by_actor_id, approval_decided_at
    ) VALUES ('Approved', 'approved', 'active', $1, 'system', 'test', now())
    RETURNING id::text
  `, [group.rows[0].id]);
  const pendingRow = await db.query<{ id: string }>(`
    INSERT INTO customers (name, approval_status, status)
    VALUES ('Pending', 'pending', 'active') RETURNING id::text
  `);
  const adminRow = await db.query<{ id: string }>(`
    INSERT INTO staff_users (clerk_user_id, email, name, role, is_active)
    VALUES ('cutover-admin', 'admin@cutover.test', 'Cutover Admin', 'admin', true)
    RETURNING id::text
  `);

  const approved: CustomerIdentity = {
    kind: "customer",
    clerkUserId: "cutover-approved",
    customerId: approvedRow.rows[0].id,
    customerUserRole: "owner",
    approvalStatus: "approved",
    accountStatus: "active",
    priceGroupId: group.rows[0].id,
  };
  const pending: CustomerIdentity = {
    kind: "customer",
    clerkUserId: "cutover-pending",
    customerId: pendingRow.rows[0].id,
    customerUserRole: "owner",
    approvalStatus: "pending",
    accountStatus: "active",
    priceGroupId: null,
  };
  const admin: StaffIdentity = {
    kind: "staff",
    clerkUserId: "cutover-admin",
    staffId: adminRow.rows[0].id,
    role: "admin",
    isActive: true,
  };
  const items = [{ productId: product.rows[0].id, quantity: 2 }];

  const pendingCart = await validateCart(pending, items, db);
  assert.equal(pendingCart.canCheckout, false);
  assert.equal(pendingCart.items[0].product?.pricing.visibility, "hidden");
  assert.equal(pendingCart.items[0].product?.isOrderable, false);

  const approvedCart = await validateCart(approved, items, db);
  assert.equal(approvedCart.canCheckout, true);
  assert.equal(approvedCart.totalPreview, 18000);
  assert.equal(approvedCart.items[0].product?.pricing.visibility, "visible");
  assert.equal(approvedCart.items[0].lineTotal, 18000);

  const created = await createOrder({
    identity: approved,
    idempotencyKey: "frontend-cutover-0001",
    items,
  }, { db });
  assert.ok(created.order.id);
  assert.equal(created.order.totalAmount, 18000);

  const adminOrders = await listAdminOrders(admin, {}, db);
  assert.equal(adminOrders.orders.some((order: { id: string }) => order.id === created.order.id), true);

  console.log("Frontend cutover integration tests passed.");
  await db.end();
}

main().catch(async (error) => {
  console.error("Frontend cutover integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
