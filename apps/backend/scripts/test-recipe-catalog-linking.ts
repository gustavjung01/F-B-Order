import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import { linkRecipeIngredient, unlinkRecipeIngredient } from "../src/modules/recipes/recipe-catalog-link.routes";

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const staff = await db.query<{ id: string }>(
    `INSERT INTO staff_users(clerk_user_id,name,role,is_active) VALUES($1,'R5 Admin','admin',true) RETURNING id::text`,
    [`r5-${suffix}`],
  );
  const identity: StaffIdentity = { kind: "staff", clerkUserId: `r5-${suffix}`, staffId: staff.rows[0].id, role: "admin", isActive: true };
  const product = await db.query<{ id: string }>(
    `INSERT INTO catalog_products(product_key,name,industry,industry_key,choice_groups,status)
     VALUES($1,'Siro R5','Nguyên liệu','nguyen-lieu','[{"key":"flavor","name":"Vị","required":true,"values":["Đào","Dâu"]}]'::jsonb,'active') RETURNING id::text`,
    [`r5-product-${suffix}`],
  );
  const otherProduct = await db.query<{ id: string }>(
    `INSERT INTO catalog_products(product_key,name,industry,industry_key,status)
     VALUES($1,'Khác','Nguyên liệu','nguyen-lieu','active') RETURNING id::text`,
    [`r5-other-${suffix}`],
  );
  const variant = await db.query<{ id: string }>(
    `INSERT INTO catalog_variants(product_id,variant_key,sku,name,options,price_mode,shop_price,status,is_active,is_public,is_orderable)
     VALUES($1::uuid,$2,$3,'Chai 700 ml','{"size":"700 ml","package":"Thùng 12 chai","sell_unit":"chai"}'::jsonb,'fixed',50000,'active',true,true,true)
     RETURNING id::text`,
    [product.rows[0].id, `r5-variant-${suffix}`, `R5-${suffix.slice(0,16)}`],
  );
  const recipe = await db.query<{ id: string }>(
    `INSERT INTO recipes(slug,title,short_description,status,visibility,difficulty,prep_minutes,cook_minutes,yield_quantity,yield_unit,created_by_staff_id)
     VALUES($1,'R5 Recipe','R5 test','draft','internal','easy',1,1,10,'portion',$2::uuid) RETURNING id::text`,
    [`r5-recipe-${suffix}`, identity.staffId],
  );
  const ingredient = await db.query<{ id: string }>(
    `INSERT INTO recipe_ingredients(recipe_id,product_name,quantity,unit,sort_order,name,source_type,usage_quantity,usage_unit)
     VALUES($1::uuid,'Siro',300,'ml',1,'Siro','external',300,'ml') RETURNING id::text`,
    [recipe.rows[0].id],
  );

  try {
    const linked = await linkRecipeIngredient(identity, recipe.rows[0].id, ingredient.rows[0].id, {
      productId: product.rows[0].id,
      variantId: variant.rows[0].id,
      selections: { flavor: "Đào" },
      usageQuantity: 300,
      usageUnit: "ml",
      packageContentQuantity: 700,
      packageContentUnit: "ml",
      wastePercent: 2,
      usableYieldPercent: 98,
      isCartReady: true,
    });
    assert.equal(linked.selectionKey, "flavor=%C4%90%C3%A0o");
    const stored = await db.query<{
      source_type: string; is_cart_ready: boolean; sku_snapshot: string; specification_snapshot: string;
      selection_key: string; catalog_product_id: string; catalog_variant_id: string;
    }>(`SELECT source_type,is_cart_ready,sku_snapshot,specification_snapshot,selection_key,catalog_product_id::text,catalog_variant_id::text
       FROM recipe_ingredients WHERE id=$1::uuid`, [ingredient.rows[0].id]);
    assert.equal(stored.rows[0].source_type, "catalog");
    assert.equal(stored.rows[0].is_cart_ready, true);
    assert.equal(stored.rows[0].catalog_product_id, product.rows[0].id);
    assert.match(stored.rows[0].specification_snapshot, /700 ml/);

    await assert.rejects(
      () => linkRecipeIngredient(identity, recipe.rows[0].id, ingredient.rows[0].id, {
        productId: otherProduct.rows[0].id, variantId: variant.rows[0].id, selections: {},
        usageQuantity: 1, usageUnit: "ml", packageContentQuantity: 1, packageContentUnit: "ml",
      }),
      /Variant does not belong/,
    );
    await assert.rejects(
      () => linkRecipeIngredient(identity, recipe.rows[0].id, ingredient.rows[0].id, {
        productId: product.rows[0].id, variantId: variant.rows[0].id, selections: {},
        usageQuantity: 1, usageUnit: "ml", packageContentQuantity: 1, packageContentUnit: "ml",
      }),
      /required/,
    );

    const unlinked = await unlinkRecipeIngredient(identity, recipe.rows[0].id, ingredient.rows[0].id);
    assert.equal(unlinked.unlinked, true);
    const cleared = await db.query<{ source_type: string; catalog_product_id: string | null; is_cart_ready: boolean }>(
      `SELECT source_type,catalog_product_id::text,is_cart_ready FROM recipe_ingredients WHERE id=$1::uuid`, [ingredient.rows[0].id],
    );
    assert.equal(cleared.rows[0].source_type, "external");
    assert.equal(cleared.rows[0].catalog_product_id, null);
    assert.equal(cleared.rows[0].is_cart_ready, false);
    console.log("Recipe Catalog V2 linking integration passed.");
  } finally {
    await db.query(`DELETE FROM recipes WHERE id=$1::uuid`, [recipe.rows[0].id]);
    await db.query(`DELETE FROM catalog_products WHERE id=ANY($1::uuid[])`, [[product.rows[0].id, otherProduct.rows[0].id]]);
    await db.query(`DELETE FROM staff_users WHERE id=$1::uuid`, [identity.staffId]);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
