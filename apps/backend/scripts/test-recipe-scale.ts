import assert from "node:assert/strict";
import { calculateRecipeScale } from "../src/modules/recipes/recipe-scale.service";

function expectOrderEngineError(action: () => unknown, code: string) {
  try {
    action();
    assert.fail(`Expected ${code}`);
  } catch (error) {
    assert.equal(error instanceof Error, true);
    assert.equal((error as { code?: string }).code, code);
  }
}

const tripleBatch = calculateRecipeScale({
  baseYieldQuantity: "1.25",
  baseYieldUnit: "lít",
  targetYieldQuantity: "3.75",
  targetYieldUnit: "LÍT",
  ingredients: [
    { productName: "Siro", quantity: "0.1", unit: "lít", catalogVariantId: "catalog-variant-1" },
    { productName: "Bột sữa", quantity: "12.5", unit: "g" },
    { productName: "Đá", quantity: null, unit: "g" },
  ],
});

assert.equal(tripleBatch.scaleFactor, "3");
assert.equal(tripleBatch.baseYield.quantity, "1.25");
assert.equal(tripleBatch.targetYield.quantity, "3.75");
assert.equal(tripleBatch.ingredients[0].scaledQuantity, "0.3");
assert.equal(tripleBatch.ingredients[1].scaledQuantity, "37.5");
assert.equal(tripleBatch.ingredients[2].scaledQuantity, null);
assert.equal(tripleBatch.ingredients[2].scaleStatus, "manual_quantity_required");
assert.deepEqual(tripleBatch.summary, {
  ingredientCount: 3,
  scaledIngredientCount: 2,
  manualQuantityRequiredCount: 1,
  catalogIngredientCount: 1,
});

const halfBatch = calculateRecipeScale({
  baseYieldQuantity: "2",
  baseYieldUnit: "mẻ",
  targetYieldQuantity: "1",
  ingredients: [{ productName: "Trà", quantity: "7.5", unit: "g" }],
});
assert.equal(halfBatch.scaleFactor, "0.5");
assert.equal(halfBatch.ingredients[0].scaledQuantity, "3.75");

const rounded = calculateRecipeScale({
  baseYieldQuantity: "6",
  baseYieldUnit: "ly",
  targetYieldQuantity: "1",
  ingredients: [{ productName: "Siro", quantity: "1", unit: "ml" }],
});
assert.equal(rounded.ingredients[0].scaledQuantity, "0.167");
assert.deepEqual(rounded.rounding, { mode: "half_up", maximumFractionDigits: 3 });

expectOrderEngineError(() => calculateRecipeScale({
  baseYieldQuantity: "1",
  baseYieldUnit: "ly",
  targetYieldQuantity: "1",
  targetYieldUnit: "mẻ",
  ingredients: [],
}), "RECIPE_SCALE_YIELD_UNIT_MISMATCH");

expectOrderEngineError(() => calculateRecipeScale({
  baseYieldQuantity: "0",
  baseYieldUnit: "ly",
  targetYieldQuantity: "1",
  ingredients: [],
}), "RECIPE_SCALE_BASE_YIELD_INVALID");

console.log("Recipe scale calculation tests passed.");
