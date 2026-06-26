import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import {
  RecipeCostError,
  costPublishedRecipe,
} from "../src/modules/recipes/recipe-cost.service";

function ingredientByName<T extends { name: string }>(items: T[], name: string): T {
  const item = items.find((candidate) => candidate.name === name);
  assert.ok(item, `Missing ingredient ${name}`);
  return item;
}

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  let recipeId: string | null = null;
  let productId: string | null = null;

  try {
    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products(product_key,name,industry,industry_key,status)
       VALUES($1,'R7 Cost Test Catalog','Nguyên liệu','nguyen-lieu','active')
       RETURNING id::text`,
      [`r7-cost-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const fixedSyrup = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,variant_key,sku,name,options,price_mode,shop_price,status,is_active,is_public,is_orderable
       ) VALUES($1::uuid,$2,$3,'Siro 700 ml','{"size":"700 ml"}'::jsonb,'fixed',70000,'active',true,true,true)
       RETURNING id::text`,
      [productId, `r7-syrup-${suffix}`, `R7-SYRUP-${suffix}`],
    );
    const fixedPowder = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,variant_key,sku,name,options,price_mode,shop_price,status,is_active,is_public,is_orderable
       ) VALUES($1::uuid,$2,$3,'Bột 1 kg','{"size":"1 kg"}'::jsonb,'fixed',100000,'active',true,true,true)
       RETURNING id::text`,
      [productId, `r7-powder-${suffix}`, `R7-POWDER-${suffix}`],
    );
    const marketPrice = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,variant_key,sku,name,options,price_mode,price_label,status,is_active,is_public,is_orderable
       ) VALUES($1::uuid,$2,$3,'Nguyên liệu thời giá','{"size":"700 ml"}'::jsonb,'market','Liên hệ','market_price',true,true,false)
       RETURNING id::text`,
      [productId, `r7-market-${suffix}`, `R7-MARKET-${suffix}`],
    );
    const missingPrice = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,variant_key,sku,name,options,price_mode,status,is_active,is_public,is_orderable
       ) VALUES($1::uuid,$2,$3,'Nguyên liệu chưa giá','{"size":"500 ml"}'::jsonb,'fixed','active',true,true,true)
       RETURNING id::text`,
      [productId, `r7-missing-price-${suffix}`, `R7-NOPRICE-${suffix}`],
    );
    const optionalGarnish = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,variant_key,sku,name,options,price_mode,shop_price,status,is_active,is_public,is_orderable
       ) VALUES($1::uuid,$2,$3,'Trang trí 10 cái','{"size":"10 cái"}'::jsonb,'fixed',50000,'active',true,true,true)
       RETURNING id::text`,
      [productId, `r7-garnish-${suffix}`, `R7-GARNISH-${suffix}`],
    );

    const recipe = await db.query<{ id: string }>(
      `INSERT INTO recipes(
         slug,title,short_description,status,visibility,difficulty,prep_minutes,cook_minutes,
         yield_quantity,yield_unit,current_version,published_at,provenance_source
       ) VALUES($1,'R7 Cost Test','Cost engine integration','published','public','easy',5,10,
         10,'portion',1,now(),'human') RETURNING id::text`,
      [`r7-cost-${suffix}`],
    );
    recipeId = recipe.rows[0].id;

    const ingredients = await db.query<{ id: string; name: string }>(
      `INSERT INTO recipe_ingredients(
         recipe_id,product_name,quantity,unit,sort_order,name,source_type,
         catalog_product_id,catalog_variant_id,usage_quantity,usage_unit,
         package_content_quantity,package_content_unit,waste_percent,usable_yield_percent,
         is_optional,is_cart_ready
       ) VALUES
         ($1::uuid,'Siro',100,'ml',1,'Siro','catalog',$2::uuid,$3::uuid,100,'ml',700,'ml',10,100,false,true),
         ($1::uuid,'Bột',0.5,'kg',2,'Bột','catalog',$2::uuid,$4::uuid,0.5,'kg',1000,'g',0,100,false,true),
         ($1::uuid,'Thời giá',50,'ml',3,'Thời giá','catalog',$2::uuid,$5::uuid,50,'ml',700,'ml',0,100,false,false),
         ($1::uuid,'Chưa giá',50,'ml',4,'Chưa giá','catalog',$2::uuid,$6::uuid,50,'ml',500,'ml',0,100,false,false),
         ($1::uuid,'Bên ngoài',100,'ml',5,'Bên ngoài','external',NULL,NULL,100,'ml',500,'ml',0,100,false,false),
         ($1::uuid,'Trang trí',1,'piece',6,'Trang trí','catalog',$2::uuid,$7::uuid,1,'piece',10,'piece',0,100,true,true)
       RETURNING id::text,name`,
      [
        recipeId,
        productId,
        fixedSyrup.rows[0].id,
        fixedPowder.rows[0].id,
        marketPrice.rows[0].id,
        missingPrice.rows[0].id,
        optionalGarnish.rows[0].id,
      ],
    );
    const optionalIngredientId = ingredientByName(ingredients.rows, "Trang trí").id;

    const cost = await costPublishedRecipe({
      recipeId,
      targetYieldQuantity: "80",
      targetYieldUnit: "portion",
      roundingPolicy: "exact",
    });

    assert.equal(cost.scaleFactor, "8");
    assert.equal(cost.currency, "VND");
    assert.equal(cost.complete, false);
    assert.equal(cost.pricedIngredientCount, 2);
    assert.equal(cost.unpricedIngredientCount, 3);
    assert.equal(cost.excludedOptionalIngredientCount, 1);
    assert.deepEqual(cost.totals, {
      scaledUsageCost: "480000",
      wasteCost: "8000",
      wasteAdjustedCost: "488000",
      purchaseCost: "540000",
      leftoverValue: "52000",
    });

    const syrup = ingredientByName(cost.ingredientCosts, "Siro");
    assert.equal(syrup.pricingStatus, "priced");
    assert.equal(syrup.packagePrice, "70000");
    assert.equal(syrup.scaledUsageCost, "80000");
    assert.equal(syrup.wasteCost, "8000");
    assert.equal(syrup.wasteAdjustedCost, "88000");
    assert.equal(syrup.purchaseCost, "140000");
    assert.equal(syrup.leftoverValue, "52000");

    const powder = ingredientByName(cost.ingredientCosts, "Bột");
    assert.equal(powder.scaledUsageCost, "400000");
    assert.equal(powder.purchaseCost, "400000");
    assert.equal(powder.leftoverValue, "0");

    const market = ingredientByName(cost.ingredientCosts, "Thời giá");
    assert.equal(market.pricingStatus, "market_price");
    assert.ok(market.costWarnings.some((warning) => warning.code === "MARKET_PRICE_UNAVAILABLE"));

    const noPrice = ingredientByName(cost.ingredientCosts, "Chưa giá");
    assert.equal(noPrice.pricingStatus, "dealer_price_unavailable");
    assert.ok(noPrice.costWarnings.some((warning) => warning.code === "DEALER_PRICE_UNAVAILABLE"));

    const external = ingredientByName(cost.ingredientCosts, "Bên ngoài");
    assert.equal(external.pricingStatus, "missing_catalog_link");
    assert.ok(external.costWarnings.some((warning) => warning.code === "MISSING_CATALOG_LINK"));

    const excludedOptional = ingredientByName(cost.ingredientCosts, "Trang trí");
    assert.equal(excludedOptional.includedInTotals, false);
    assert.equal(excludedOptional.pricingStatus, "priced");
    assert.ok(excludedOptional.costWarnings.some((warning) => warning.code === "OPTIONAL_INGREDIENT_EXCLUDED"));

    const withOptional = await costPublishedRecipe({
      recipeId,
      targetYieldQuantity: "80",
      targetYieldUnit: "portion",
      roundingPolicy: "exact",
      includeOptionalIngredientIds: [optionalIngredientId],
    });
    assert.equal(withOptional.excludedOptionalIngredientCount, 0);
    assert.deepEqual(withOptional.selectedOptionalIngredientIds, [optionalIngredientId]);
    assert.deepEqual(withOptional.totals, {
      scaledUsageCost: "520000",
      wasteCost: "8000",
      wasteAdjustedCost: "528000",
      purchaseCost: "590000",
      leftoverValue: "62000",
    });
    const selectedOptional = ingredientByName(withOptional.ingredientCosts, "Trang trí");
    assert.equal(selectedOptional.includedInTotals, true);
    assert.equal(selectedOptional.scaledUsageCost, "40000");
    assert.equal(selectedOptional.purchaseCost, "50000");
    assert.equal(selectedOptional.leftoverValue, "10000");
    assert.ok(!selectedOptional.scaleWarnings.some((warning) => warning.code === "OPTIONAL_INGREDIENT_REQUIRES_SELECTION"));

    await assert.rejects(
      () => costPublishedRecipe({
        recipeId: recipeId as string,
        targetYieldQuantity: "80",
        targetYieldUnit: "portion",
        roundingPolicy: "exact",
        includeOptionalIngredientIds: [randomUUID()],
      }),
      (error: unknown) => error instanceof RecipeCostError
        && error.code === "OPTIONAL_INGREDIENT_NOT_FOUND"
        && error.status === 400,
    );

    console.log("Recipe R7 cost engine integration passed.");
  } finally {
    if (recipeId) await db.query(`DELETE FROM recipes WHERE id=$1::uuid`, [recipeId]);
    if (productId) await db.query(`DELETE FROM catalog_products WHERE id=$1::uuid`, [productId]);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
