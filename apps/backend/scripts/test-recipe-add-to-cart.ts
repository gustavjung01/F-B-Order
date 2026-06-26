import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { CustomerIdentity } from "../src/modules/auth/auth.identity";
import {
  RecipeCartError,
  addRecipeIngredientsToCart,
} from "../src/modules/recipes/recipe-cart.service";

function rowByName<T extends { name: string }>(rows: T[], name: string) {
  const row = rows.find((candidate) => candidate.name === name);
  assert.ok(row, `Missing row ${name}`);
  return row;
}

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  let customerId: string | null = null;
  let productId: string | null = null;
  const recipeIds: string[] = [];

  try {
    const customer = await db.query<{ id: string }>(
      `INSERT INTO customers(
         clerk_user_id,name,approval_status,status,
         approval_decided_by_actor_type,approval_decided_by_actor_id,approval_decided_at
       ) VALUES($1,'R8b Recipe Cart Customer','approved','active','system','system:r8b-test',now())
       RETURNING id::text`,
      [`r8b-cart-${suffix}`],
    );
    customerId = customer.rows[0].id;

    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products(
         product_key,name,industry,industry_key,status,choice_groups
       ) VALUES($1,'R8b Recipe Cart Product','Nguyên liệu','nguyen-lieu','active','[]'::jsonb)
       RETURNING id::text`,
      [`r8b-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const variants = await db.query<{ id: string; name: string }>(
      `INSERT INTO catalog_variants(
         product_id,variant_key,sku,name,options,price_mode,shop_price,status,
         is_active,is_public,is_orderable,sort_order
       ) VALUES
         ($1::uuid,$2,$3,'Siro 700 ml','{"size":"700 ml"}'::jsonb,'fixed',70000,'active',true,true,true,1),
         ($1::uuid,$4,$5,'Trang trí 10 cái','{"size":"10 cái"}'::jsonb,'fixed',50000,'active',true,true,true,2)
       RETURNING id::text,name`,
      [
        productId,
        `r8b-syrup-${suffix}`,
        `R8B-SYRUP-${suffix}`,
        `r8b-garnish-${suffix}`,
        `R8B-GARNISH-${suffix}`,
      ],
    );
    const syrupVariantId = rowByName(variants.rows, "Siro 700 ml").id;
    const garnishVariantId = rowByName(variants.rows, "Trang trí 10 cái").id;

    const recipe = await db.query<{ id: string }>(
      `INSERT INTO recipes(
         slug,title,short_description,status,visibility,difficulty,prep_minutes,cook_minutes,
         yield_quantity,yield_unit,current_version,published_at,provenance_source
       ) VALUES($1,'R8b Recipe Cart','Recipe cart integration','published','public','easy',5,10,
         10,'portion',1,now(),'human') RETURNING id::text`,
      [`r8b-recipe-${suffix}`],
    );
    const recipeId = recipe.rows[0].id;
    recipeIds.push(recipeId);

    const ingredients = await db.query<{ id: string; name: string }>(
      `INSERT INTO recipe_ingredients(
         recipe_id,product_name,quantity,unit,sort_order,name,source_type,
         catalog_product_id,catalog_variant_id,default_selections,selection_key,
         usage_quantity,usage_unit,package_content_quantity,package_content_unit,
         waste_percent,usable_yield_percent,is_optional,is_cart_ready
       ) VALUES
         ($1::uuid,'Siro chính',100,'ml',1,'Siro chính','catalog',$2::uuid,$3::uuid,'{}'::jsonb,'',100,'ml',700,'ml',0,100,false,true),
         ($1::uuid,'Siro bổ sung',50,'ml',2,'Siro bổ sung','catalog',$2::uuid,$3::uuid,'{}'::jsonb,'',50,'ml',700,'ml',0,100,false,true),
         ($1::uuid,'Trang trí',1,'piece',3,'Trang trí','catalog',$2::uuid,$4::uuid,'{}'::jsonb,'',1,'piece',10,'piece',0,100,true,true)
       RETURNING id::text,name`,
      [recipeId, productId, syrupVariantId, garnishVariantId],
    );
    const optionalIngredientId = rowByName(ingredients.rows, "Trang trí").id;

    const identity: CustomerIdentity = {
      kind: "customer",
      clerkUserId: `r8b-cart-${suffix}`,
      customerId,
      customerUserRole: "owner",
      approvalStatus: "approved",
      accountStatus: "active",
      priceGroupId: null,
    };

    const withoutOptional = await addRecipeIngredientsToCart(identity, {
      recipeId,
      targetYieldQuantity: "80",
      targetYieldUnit: "portion",
      roundingPolicy: "exact",
    });
    assert.equal(withoutOptional.scaleFactor, "8");
    assert.equal(withoutOptional.includedIngredientCount, 2);
    assert.equal(withoutOptional.cartLineCount, 1);
    assert.deepEqual(withoutOptional.excludedOptionalIngredientIds, [optionalIngredientId]);
    assert.equal(withoutOptional.items[0].variantId, syrupVariantId);
    assert.equal(withoutOptional.items[0].quantity, 3);
    assert.equal(withoutOptional.items[0].lineTotal, 210000);

    const withOptional = await addRecipeIngredientsToCart(identity, {
      recipeId,
      targetYieldQuantity: "80",
      targetYieldUnit: "portion",
      roundingPolicy: "exact",
      includeOptionalIngredientIds: [optionalIngredientId],
    });
    assert.equal(withOptional.includedIngredientCount, 3);
    assert.equal(withOptional.cartLineCount, 2);
    assert.deepEqual(withOptional.selectedOptionalIngredientIds, [optionalIngredientId]);
    assert.deepEqual(withOptional.excludedOptionalIngredientIds, []);
    const syrupItem = withOptional.items.find((item) => item.variantId === syrupVariantId);
    const garnishItem = withOptional.items.find((item) => item.variantId === garnishVariantId);
    assert.equal(syrupItem?.quantity, 3);
    assert.equal(garnishItem?.quantity, 1);

    const cartRows = await db.query<{ variant_id: string; quantity: string }>(
      `SELECT variant_id::text,quantity::text
       FROM cart_items
       WHERE cart_id=$1::uuid
       ORDER BY variant_id`,
      [withOptional.cartId],
    );
    assert.equal(cartRows.rowCount, 2);
    assert.equal(cartRows.rows.find((row) => row.variant_id === syrupVariantId)?.quantity, "3.00");
    assert.equal(cartRows.rows.find((row) => row.variant_id === garnishVariantId)?.quantity, "1.00");

    await assert.rejects(
      () => addRecipeIngredientsToCart(identity, {
        recipeId,
        targetYieldQuantity: "80",
        targetYieldUnit: "portion",
        roundingPolicy: "exact",
        includeOptionalIngredientIds: [randomUUID()],
      }),
      (error: unknown) => error instanceof RecipeCartError
        && error.code === "OPTIONAL_INGREDIENT_NOT_FOUND"
        && error.status === 400,
    );

    const blockedRecipe = await db.query<{ id: string }>(
      `INSERT INTO recipes(
         slug,title,short_description,status,visibility,difficulty,prep_minutes,cook_minutes,
         yield_quantity,yield_unit,current_version,published_at,provenance_source
       ) VALUES($1,'R8b Blocked Recipe Cart','Blocked recipe integration','published','public','easy',5,10,
         10,'portion',1,now(),'human') RETURNING id::text`,
      [`r8b-blocked-${suffix}`],
    );
    const blockedRecipeId = blockedRecipe.rows[0].id;
    recipeIds.push(blockedRecipeId);

    await db.query(
      `INSERT INTO recipe_ingredients(
         recipe_id,product_name,quantity,unit,sort_order,name,source_type,
         catalog_product_id,catalog_variant_id,default_selections,selection_key,
         usage_quantity,usage_unit,package_content_quantity,package_content_unit,
         waste_percent,usable_yield_percent,is_optional,is_cart_ready
       ) VALUES
         ($1::uuid,'Siro hợp lệ',100,'ml',1,'Siro hợp lệ','catalog',$2::uuid,$3::uuid,'{}'::jsonb,'',100,'ml',700,'ml',0,100,false,true),
         ($1::uuid,'Nguyên liệu ngoài',100,'ml',2,'Nguyên liệu ngoài','external',NULL,NULL,'{}'::jsonb,'',100,'ml',500,'ml',0,100,false,false)`,
      [blockedRecipeId, productId, syrupVariantId],
    );

    await assert.rejects(
      () => addRecipeIngredientsToCart(identity, {
        recipeId: blockedRecipeId,
        targetYieldQuantity: "80",
        targetYieldUnit: "portion",
        roundingPolicy: "exact",
      }),
      (error: unknown) => error instanceof RecipeCartError
        && error.code === "RECIPE_CART_NOT_READY"
        && error.status === 422
        && Array.isArray((error.details as { issues?: unknown[] } | undefined)?.issues),
    );

    const afterBlocked = await db.query<{ quantity: string }>(
      `SELECT quantity::text
       FROM cart_items
       WHERE cart_id=$1::uuid AND variant_id=$2::uuid AND selection_key=''`,
      [withOptional.cartId, syrupVariantId],
    );
    assert.equal(afterBlocked.rows[0].quantity, "3.00");

    console.log("Recipe R8b add ingredients to cart integration passed.");
  } finally {
    for (const recipeId of recipeIds) {
      await db.query(`DELETE FROM recipes WHERE id=$1::uuid`, [recipeId]);
    }
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
