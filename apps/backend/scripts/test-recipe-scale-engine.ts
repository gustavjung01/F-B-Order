import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import {
  RecipeScaleError,
  scalePublishedRecipe,
} from "../src/modules/recipes/recipe-scale.service";
import {
  convertRecipeQuantity,
  decimalString,
  parseDecimal,
} from "../src/modules/recipes/recipe-units";

function ingredientByName<T extends { name: string }>(items: T[], name: string): T {
  const item = items.find((candidate) => candidate.name === name);
  assert.ok(item, `Missing ingredient ${name}`);
  return item;
}

async function main() {
  const oneKilogramInGrams = convertRecipeQuantity(parseDecimal("1"), "kg", "g");
  assert.ok(oneKilogramInGrams);
  assert.equal(decimalString(oneKilogramInGrams), "1000");
  assert.equal(convertRecipeQuantity(parseDecimal("1"), "g", "ml"), null);

  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const recipe = await db.query<{ id: string }>(
    `INSERT INTO recipes(
       slug,title,short_description,status,visibility,difficulty,prep_minutes,cook_minutes,
       yield_quantity,yield_unit,current_version,published_at,provenance_source
     ) VALUES($1,'R6 Scale Test','Scale engine integration','published','public','easy',5,10,
       10,'portion',1,now(),'human') RETURNING id::text`,
    [`r6-scale-${suffix}`],
  );
  const recipeId = recipe.rows[0].id;

  await db.query(
    `INSERT INTO recipe_ingredients(
       recipe_id,product_name,quantity,unit,sort_order,name,source_type,usage_quantity,usage_unit,
       package_content_quantity,package_content_unit,waste_percent,usable_yield_percent,is_optional,is_cart_ready
     ) VALUES
       ($1::uuid,'Nước',1000,'ml',1,'Nước','external',1000,'ml',700,'ml',0,100,false,false),
       ($1::uuid,'Siro',100,'ml',2,'Siro','external',100,'ml',700,'ml',10,100,false,false),
       ($1::uuid,'Bột',0.5,'kg',3,'Bột','external',0.5,'kg',1000,'g',0,100,false,false),
       ($1::uuid,'Bột tinh chỉnh',0.333,'kg',4,'Bột tinh chỉnh','external',0.333,'kg',1,'kg',0,100,false,false),
       ($1::uuid,'Trang trí',1,'piece',5,'Trang trí','external',1,'piece',NULL,NULL,0,100,true,false),
       ($1::uuid,'Sai đơn vị',100,'g',6,'Sai đơn vị','external',100,'g',100,'ml',0,100,false,false)`,
    [recipeId],
  );

  try {
    const scaled = await scalePublishedRecipe({
      recipeId,
      targetYieldQuantity: "80",
      targetYieldUnit: "portion",
      roundingPolicy: "exact",
    });

    assert.equal(scaled.scaleFactor, "8");
    assert.equal(scaled.baseYield.quantity, "10");
    assert.equal(scaled.targetYield.quantity, "80");
    assert.ok(scaled.warnings.some((item) => item.code === "LARGE_SCALE_REVIEW_RECOMMENDED"));

    const water = ingredientByName(scaled.scaledIngredients, "Nước");
    assert.equal(water.rawRequiredQuantity, "8000");
    assert.equal(water.scaledQuantity, "8000");
    assert.equal(water.wasteAdjustedQuantity, "8000");
    assert.equal(water.purchasePackageCount, "12");
    assert.equal(water.purchaseQuantity, "8400");
    assert.equal(water.leftoverQuantity, "400");

    const syrup = ingredientByName(scaled.scaledIngredients, "Siro");
    assert.equal(syrup.rawRequiredQuantity, "800");
    assert.equal(syrup.wasteAdjustedQuantity, "880");
    assert.equal(syrup.purchasePackageCount, "2");
    assert.equal(syrup.leftoverQuantity, "520");

    const powder = ingredientByName(scaled.scaledIngredients, "Bột");
    assert.equal(powder.rawRequiredQuantity, "4");
    assert.equal(powder.quantityUnit, "kg");
    assert.equal(powder.packageContentUnit, "g");
    assert.equal(powder.purchasePackageCount, "4");
    assert.equal(powder.purchaseQuantity, "4000");
    assert.equal(powder.leftoverQuantity, "0");

    const garnish = ingredientByName(scaled.scaledIngredients, "Trang trí");
    assert.equal(garnish.rawRequiredQuantity, "8");
    assert.equal(garnish.purchasePackageCount, null);
    assert.ok(garnish.warnings.some((item) => item.code === "OPTIONAL_INGREDIENT_REQUIRES_SELECTION"));
    assert.ok(garnish.warnings.some((item) => item.code === "PACKAGE_CONVERSION_MISSING"));

    const incompatible = ingredientByName(scaled.scaledIngredients, "Sai đơn vị");
    assert.equal(incompatible.rawRequiredQuantity, "800");
    assert.equal(incompatible.purchasePackageCount, null);
    assert.ok(incompatible.warnings.some((item) => item.code === "PACKAGE_UNIT_INCOMPATIBLE"));

    const practical = await scalePublishedRecipe({
      recipeId,
      targetYieldQuantity: "15",
      targetYieldUnit: "portion",
      roundingPolicy: "practical",
    });
    const precisePowder = ingredientByName(practical.scaledIngredients, "Bột tinh chỉnh");
    assert.equal(precisePowder.rawRequiredQuantity, "0.4995");
    assert.equal(precisePowder.scaledQuantity, "0.5");
    assert.equal(precisePowder.purchasePackageCount, "1");

    await assert.rejects(
      () => scalePublishedRecipe({
        recipeId,
        targetYieldQuantity: "80",
        targetYieldUnit: "l",
        roundingPolicy: "exact",
      }),
      (error: unknown) => error instanceof RecipeScaleError
        && error.code === "TARGET_YIELD_UNIT_INCOMPATIBLE"
        && error.status === 422,
    );

    console.log("Recipe R6 scale engine integration passed.");
  } finally {
    await db.query(`DELETE FROM recipes WHERE id=$1::uuid`, [recipeId]);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
