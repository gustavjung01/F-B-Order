import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import {
  createAdminRecipe,
  publishRecipe,
  reviewRecipe,
  submitRecipeForReview,
  updateAdminRecipe,
} from "../src/modules/recipes/recipe-admin.service";
import {
  calculateRecipeScale,
  scaleAdminRecipe,
} from "../src/modules/recipes/recipe-scale.service";

function expectOrderEngineError(action: () => unknown, code: string) {
  try {
    action();
    assert.fail(`Expected ${code}`);
  } catch (error) {
    assert.equal(error instanceof Error, true);
    assert.equal((error as { code?: string }).code, code);
  }
}

async function expectAsyncOrderEngineError(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
  });
}

function verifyPureScaleCalculation() {
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
    baseYieldQuantity: null,
    baseYieldUnit: "ly",
    targetYieldQuantity: "1",
    ingredients: [],
  }), "RECIPE_SCALE_BASE_YIELD_INVALID");

  expectOrderEngineError(() => calculateRecipeScale({
    baseYieldQuantity: "1",
    baseYieldUnit: "",
    targetYieldQuantity: "1",
    ingredients: [],
  }), "RECIPE_SCALE_BASE_YIELD_UNIT_REQUIRED");

  expectOrderEngineError(() => calculateRecipeScale({
    baseYieldQuantity: "0",
    baseYieldUnit: "ly",
    targetYieldQuantity: "1",
    ingredients: [],
  }), "RECIPE_SCALE_BASE_YIELD_INVALID");
}

async function main() {
  verifyPureScaleCalculation();

  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const clerkUserId = `recipe-scale-${suffix}`;
  let staffId: string | null = null;
  let recipeId: string | null = null;
  let catalogProductId: string | null = null;
  let catalogVariantId: string | null = null;

  try {
    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products (
         catalog_version,
         product_key,
         name,
         brand,
         industry,
         industry_key,
         subcategory,
         source_group,
         option_groups,
         status,
         sort_order,
         catalog_group_key
       ) VALUES (
         'hung-phat-v2',
         $1,
         'Trà fixture cho Recipe scale',
         'Bếp Sỉ',
         'Nguyên liệu trà sữa',
         'nguyen-lieu-tra-sua',
         'Trà',
         'recipe-scale-test',
         '[]'::jsonb,
         'active',
         999998,
         'tra'
       )
       RETURNING id::text`,
      [`recipe-scale-product-${suffix}`],
    );
    catalogProductId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants (
         product_id,
         catalog_version,
         variant_key,
         sku,
         name,
         options,
         price_mode,
         shop_price,
         status,
         is_active,
         is_public,
         is_orderable,
         sort_order
       ) VALUES (
         $1::uuid,
         'hung-phat-v2',
         $2,
         $3,
         'Gói kiểm thử 1kg',
         '{"size":"1kg","sell_unit":"gói"}'::jsonb,
         'fixed',
         100000,
         'active',
         true,
         true,
         true,
         999998
       )
       RETURNING id::text`,
      [catalogProductId, `recipe-scale-variant-${suffix}`, `RSC-${suffix.slice(0, 20)}`],
    );
    catalogVariantId = variant.rows[0].id;

    const staff = await db.query<{ id: string }>(
      `INSERT INTO staff_users (clerk_user_id, email, name, role, is_active)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id::text`,
      [clerkUserId, `recipe-scale-${suffix}@example.com`, "Recipe Scale Test"],
    );
    staffId = staff.rows[0].id;

    const identity: StaffIdentity = {
      kind: "staff",
      clerkUserId,
      staffId,
      role: "admin",
      isActive: true,
    };

    const publishedDocument = {
      slug: `recipe-scale-${suffix}`,
      title: "Công thức nguồn đã xuất bản",
      shortDescription: "Kiểm thử current và published scale source.",
      description: "Fixture được xóa sau khi test.",
      relatedBrand: "Bếp Sỉ",
      yieldQuantity: 10,
      yieldUnit: "ly",
      changeNote: "Tạo version sẽ được xuất bản",
      ingredients: [
        {
          catalogVariantId,
          quantity: 100,
          unit: "ml",
          optional: false,
          note: "Lượng của published version",
        },
      ],
      steps: [
        {
          title: "Pha",
          content: "Pha phiên bản đầu tiên.",
        },
      ],
    };

    const created = await createAdminRecipe(identity, publishedDocument, db);
    recipeId = String(created.recipe.id);
    assert.equal(created.recipe.currentVersionNo, 1);

    await expectAsyncOrderEngineError(
      () => scaleAdminRecipe(identity, recipeId as string, {
        source: "published",
        targetYieldQuantity: 20,
      }, db),
      "RECIPE_PUBLISHED_VERSION_NOT_FOUND",
    );

    await submitRecipeForReview(identity, recipeId, db);
    await reviewRecipe(identity, recipeId, {
      decision: "approved",
      note: "Duyệt để khóa published source.",
    }, db);
    const published = await publishRecipe(identity, recipeId, db);
    assert.equal(published.recipe.currentVersionNo, 1);
    assert.equal(published.recipe.workflowStatus, "published");

    const currentDraft = await updateAdminRecipe(identity, recipeId, {
      ...publishedDocument,
      title: "Công thức current draft mới",
      yieldQuantity: 20,
      changeNote: "Tạo current version khác published version",
      ingredients: [
        {
          catalogVariantId,
          quantity: 300,
          unit: "ml",
          optional: false,
          note: "Lượng của current version",
        },
      ],
      steps: [
        {
          title: "Pha mới",
          content: "Pha phiên bản current mới.",
        },
      ],
    }, db);
    assert.equal(currentDraft.recipe.currentVersionNo, 2);
    assert.equal(currentDraft.recipe.workflowStatus, "draft");
    assert.notEqual(currentDraft.recipe.currentVersionId, currentDraft.recipe.publishedVersionId);

    const currentScale = await scaleAdminRecipe(identity, recipeId, {
      source: "current",
      targetYieldQuantity: 40,
      targetYieldUnit: "LY",
    }, db);
    assert.equal(currentScale.source, "current");
    assert.equal(currentScale.recipe.title, "Công thức current draft mới");
    assert.equal(currentScale.recipe.sourceVersionNo, 2);
    assert.deepEqual(currentScale.baseYield, { quantity: "20", unit: "ly" });
    assert.equal(currentScale.scaleFactor, "2");
    assert.equal(currentScale.ingredients[0]?.baseQuantity, "300");
    assert.equal(currentScale.ingredients[0]?.scaledQuantity, "600");
    assert.equal(currentScale.ingredients[0]?.note, "Lượng của current version");

    const publishedScale = await scaleAdminRecipe(identity, recipeId, {
      source: "published",
      targetYieldQuantity: 20,
      targetYieldUnit: "ly",
    }, db);
    assert.equal(publishedScale.source, "published");
    assert.equal(publishedScale.recipe.title, "Công thức nguồn đã xuất bản");
    assert.equal(publishedScale.recipe.sourceVersionNo, 1);
    assert.deepEqual(publishedScale.baseYield, { quantity: "10", unit: "ly" });
    assert.equal(publishedScale.scaleFactor, "2");
    assert.equal(publishedScale.ingredients[0]?.baseQuantity, "100");
    assert.equal(publishedScale.ingredients[0]?.scaledQuantity, "200");
    assert.equal(publishedScale.ingredients[0]?.note, "Lượng của published version");

    await expectAsyncOrderEngineError(
      () => scaleAdminRecipe(identity, recipeId as string, {
        source: "current",
        targetYieldQuantity: 40,
        targetYieldUnit: "mẻ",
      }, db),
      "RECIPE_SCALE_YIELD_UNIT_MISMATCH",
    );

    await expectAsyncOrderEngineError(
      () => scaleAdminRecipe(identity, recipeId as string, {
        source: "future",
        targetYieldQuantity: 40,
      }, db),
      "RECIPE_SCALE_SOURCE_INVALID",
    );

    console.log("Recipe scale calculation and source integration tests passed.");
  } finally {
    if (recipeId) {
      await db.query("DELETE FROM recipes WHERE id = $1::uuid", [recipeId]).catch(() => undefined);
    }
    if (staffId) {
      await db.query("DELETE FROM staff_users WHERE id = $1::uuid", [staffId]).catch(() => undefined);
    }
    if (catalogVariantId) {
      await db.query("DELETE FROM catalog_variants WHERE id = $1::uuid", [catalogVariantId]).catch(() => undefined);
    }
    if (catalogProductId) {
      await db.query("DELETE FROM catalog_products WHERE id = $1::uuid", [catalogProductId]).catch(() => undefined);
    }
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
