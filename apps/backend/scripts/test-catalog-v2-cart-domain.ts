import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { CustomerIdentity, RequestIdentity } from "../src/modules/auth/auth.identity";
import {
  CatalogV2CartError,
  addCatalogChoiceCartItem,
  addCatalogChoiceCartItems,
  removeCatalogChoiceCartItem,
} from "../src/modules/catalog-v2/catalog-v2-cart-domain.service";

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const strawberryKey = `flavor=${encodeURIComponent("Dâu")}`;
  const peachKey = `flavor=${encodeURIComponent("Đào")}`;
  let customerId: string | null = null;
  let productId: string | null = null;

  try {
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers(
         clerk_user_id,name,approval_status,status,
         approval_decided_by_actor_type,approval_decided_by_actor_id,approval_decided_at
       ) VALUES($1,'R8a Cart Customer','approved','active','system','system:r8a-test',now())
       RETURNING id::text`,
      [`r8a-cart-${suffix}`],
    );
    customerId = customer.rows[0].id;

    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products(
         product_key,name,industry,industry_key,status,choice_groups
       ) VALUES($1,'R8a Cart Product','Nguyên liệu','nguyen-lieu','active',
         '[{"key":"flavor","name":"Vị","required":true,"values":["Dâu","Đào"]}]'::jsonb)
       RETURNING id::text`,
      [`r8a-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,variant_key,sku,name,options,price_mode,shop_price,status,
         is_active,is_public,is_orderable
       ) VALUES($1::uuid,$2,$3,'Siro 700 ml','{"size":"700 ml"}'::jsonb,
         'fixed',70000,'active',true,true,true)
       RETURNING id::text`,
      [productId, `r8a-variant-${suffix}`, `R8A-${suffix}`],
    );
    const variantId = variant.rows[0].id;

    const identity: CustomerIdentity = {
      kind: "customer",
      clerkUserId: `r8a-cart-${suffix}`,
      customerId,
      customerUserRole: "owner",
      approvalStatus: "approved",
      accountStatus: "active",
      priceGroupId: null,
    };

    const added = await addCatalogChoiceCartItem(identity, {
      variantId,
      quantity: 2,
      selections: { flavor: "Dâu" },
    });
    assert.ok(added.cartId);
    assert.equal(added.item.quantity, 2);
    assert.equal(added.item.selectionKey, strawberryKey);
    assert.equal(added.item.lineTotal, 140000);

    const updated = await addCatalogChoiceCartItem(identity, {
      variant_id: variantId,
      quantity: 3,
      selections: { flavor: "Dâu" },
    });
    assert.equal(updated.cartId, added.cartId);
    assert.equal(updated.item.quantity, 3);

    const secondSelection = await addCatalogChoiceCartItem(identity, {
      variantId,
      quantity: 1,
      selections: { flavor: "Đào" },
    });
    assert.equal(secondSelection.item.selectionKey, peachKey);

    const rows = await db.query<{ quantity: string; selection_key: string }>(
      `SELECT quantity::text,selection_key
       FROM cart_items
       WHERE cart_id=$1::uuid
       ORDER BY selection_key`,
      [added.cartId],
    );
    assert.deepEqual(rows.rows, [
      { quantity: "3.00", selection_key: strawberryKey },
      { quantity: "1.00", selection_key: peachKey },
    ].sort((left, right) => left.selection_key.localeCompare(right.selection_key)));

    const beforeRollback = await db.query<{ quantity: string }>(
      `SELECT quantity::text FROM cart_items
       WHERE cart_id=$1::uuid AND variant_id=$2::uuid AND selection_key=$3`,
      [added.cartId, variantId, strawberryKey],
    );
    assert.equal(beforeRollback.rows[0].quantity, "3.00");

    await assert.rejects(
      () => addCatalogChoiceCartItems(identity, [
        { variantId, quantity: 9, selections: { flavor: "Dâu" } },
        { variantId: randomUUID(), quantity: 1, selections: {} },
      ]),
      (error: unknown) => error instanceof CatalogV2CartError
        && error.code === "VARIANT_NOT_FOUND"
        && error.status === 404,
    );

    const afterRollback = await db.query<{ quantity: string }>(
      `SELECT quantity::text FROM cart_items
       WHERE cart_id=$1::uuid AND variant_id=$2::uuid AND selection_key=$3`,
      [added.cartId, variantId, strawberryKey],
    );
    assert.equal(afterRollback.rows[0].quantity, "3.00");

    const removed = await removeCatalogChoiceCartItem(identity, {
      variantId,
      selectionKey: strawberryKey,
    });
    assert.equal(removed.removed, true);

    const remaining = await db.query<{ selection_key: string }>(
      `SELECT selection_key FROM cart_items WHERE cart_id=$1::uuid`,
      [added.cartId],
    );
    assert.deepEqual(remaining.rows, [{ selection_key: peachKey }]);

    const deniedIdentities: Array<[RequestIdentity, string]> = [
      [{ kind: "anonymous", clerkUserId: null }, "AUTH_REQUIRED"],
      [{ kind: "unmapped", clerkUserId: "unmapped" }, "CUSTOMER_PROFILE_REQUIRED"],
      [{ kind: "staff", clerkUserId: "staff", staffId: randomUUID(), role: "staff", isActive: true }, "CUSTOMER_ACCESS_ONLY"],
      [{ ...identity, accountStatus: "inactive" }, "CUSTOMER_INACTIVE"],
      [{ ...identity, approvalStatus: "pending" }, "CUSTOMER_NOT_APPROVED"],
    ];
    for (const [denied, code] of deniedIdentities) {
      await assert.rejects(
        () => addCatalogChoiceCartItem(denied, { variantId, quantity: 1, selections: { flavor: "Đào" } }),
        (error: unknown) => error instanceof CatalogV2CartError && error.code === code,
      );
    }

    console.log("Catalog v2 cart domain integration passed.");
  } finally {
    if (customerId) await db.query(`DELETE FROM customers WHERE id=$1::uuid`, [customerId]);
    if (productId) await db.query(`DELETE FROM catalog_products WHERE id=$1::uuid`, [productId]);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
