import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import { createAdminRecipe, updateAdminRecipe } from "../src/modules/recipes/recipe-admin.service";
import {
  compareAdminRecipeVersions,
  enqueueRecipeVersionAnalysis,
} from "../src/modules/recipes/recipe-version-compare.service";

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  let staffId: string | null = null;
  let productId: string | null = null;
  let variantId: string | null = null;
  let recipeId: string | null = null;
  let jobId: string | null = null;

  try {
    const staff = await db.query<{ id: string }>(
      `INSERT INTO staff_users(clerk_user_id,email,name,role,is_active)
       VALUES($1,$2,$3,'admin',true)
       RETURNING id::text`,
      [`recipe-version-analysis-${suffix}`, `recipe-version-analysis-${suffix}@example.com`, "Recipe Version Analysis Test"],
    );
    staffId = staff.rows[0].id;
    const identity: StaffIdentity = {
      kind: "staff",
      clerkUserId: `recipe-version-analysis-${suffix}`,
      staffId,
      role: "admin",
      isActive: true,
    };

    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products(
         catalog_version,product_key,name,brand,industry,industry_key,subcategory,
         source_group,option_groups,status,sort_order,catalog_group_key
       ) VALUES(
         'hung-phat-v2',$1,'Trà fixture so sánh version','Bếp Sỉ','Nguyên liệu trà sữa',
         'nguyen-lieu-tra-sua','Trà','recipe-version-analysis-test','[]'::jsonb,
         'active',999997,'tra'
       ) RETURNING id::text`,
      [`recipe-version-analysis-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,catalog_version,variant_key,sku,name,options,price_mode,price_label,
         retail_price,shop_price,status,is_active,is_public,is_orderable,sort_order
       ) VALUES(
         $1,'hung-phat-v2',$2,$3,'Gói 1kg','{"size":"1kg"}'::jsonb,
         'fixed',NULL,NULL,100000,'active',true,true,true,999997
       ) RETURNING id::text`,
      [productId, `recipe-version-analysis-variant-${suffix}`, `RVA-${suffix.slice(0, 20)}`],
    );
    variantId = variant.rows[0].id;

    const base = await createAdminRecipe(identity, {
      slug: `recipe-version-analysis-${suffix}`,
      title: "Trà tắc kiểm thử version",
      shortDescription: "Fixture Phase 4",
      description: "Dữ liệu integration test phải được dọn sau khi chạy.",
      relatedBrand: "Bếp Sỉ",
      yieldQuantity: 10,
      yieldUnit: "ly",
      sortOrder: 999997,
      changeNote: "Version nền có QC",
      ingredients: [
        {
          catalogVariantId: variantId,
          quantity: 100,
          unit: "g",
          optional: false,
          note: "Định lượng nền",
        },
      ],
      steps: [
        { title: "Pha trà", content: "Khuấy đều trong 30 giây.", imageUrl: null },
        { title: "QC thành phẩm", content: "Kiểm tra màu sắc và độ trong trước khi rót.", imageUrl: null },
      ],
    }, db);
    recipeId = String(base.recipe.id);
    const fromVersionId = String(base.recipe.currentVersionId);

    const updated = await updateAdminRecipe(identity, recipeId, {
      slug: `recipe-version-analysis-${suffix}`,
      title: "Trà tắc kiểm thử version",
      shortDescription: "Fixture Phase 4 đã thay đổi",
      description: "Dữ liệu integration test phải được dọn sau khi chạy.",
      relatedBrand: "Bếp Sỉ",
      yieldQuantity: 8,
      yieldUnit: "ly",
      sortOrder: 999997,
      changeNote: "Tăng định lượng và bỏ bước QC",
      ingredients: [
        {
          catalogVariantId: variantId,
          quantity: 150,
          unit: "g",
          optional: false,
          note: "Định lượng mới",
        },
      ],
      steps: [
        { title: "Pha trà", content: "Khuấy đều trong 60 giây.", imageUrl: null },
      ],
    }, db);
    const toVersionId = String(updated.recipe.currentVersionId);

    const comparison = await compareAdminRecipeVersions(identity, recipeId, {
      fromVersionId,
      toVersionId,
    }, db);

    assert.equal(comparison.fromVersion.versionNo, 1);
    assert.equal(comparison.toVersion.versionNo, 2);
    assert.ok(comparison.metadataChanges.some((change) => change.field === "yieldQuantity"));
    assert.equal(comparison.ingredientChanges.length, 1);
    assert.ok(comparison.ingredientChanges[0]?.changedFields.includes("quantity"));
    assert.ok(comparison.stepChanges.some((change) => change.kind === "removed" && change.label === "QC thành phẩm"));
    assert.equal(comparison.cost.from.status, "ready");
    assert.equal(comparison.cost.to.status, "ready");
    assert.equal(comparison.cost.from.costPerYield, 1000);
    assert.equal(comparison.cost.to.costPerYield, 1875);
    assert.equal(comparison.cost.costPerYieldDelta, 875);
    assert.equal(comparison.cost.percentDelta, 87.5);
    assert.ok(comparison.risks.some((risk) => risk.code === "YIELD_CHANGED" && risk.severity === "high"));
    assert.ok(comparison.risks.some((risk) => risk.code === "QC_STEP_REMOVED" && risk.severity === "high"));
    assert.ok(comparison.risks.some((risk) => risk.code === "COST_INCREASE_HIGH" && risk.severity === "high"));

    const queued = await enqueueRecipeVersionAnalysis(identity, recipeId, {
      fromVersionId,
      toVersionId,
      prompt: "Phân tích tác động của thay đổi này trước khi duyệt.",
    }, db);
    jobId = queued.jobId;
    assert.equal(queued.status, "pending");

    const job = await db.query<{
      job_type: string;
      context_scope: string[];
      context_data: { recipeVersionComparison?: { schemaVersion?: string }; policy?: { readOnly?: boolean } };
    }>(
      `SELECT job_type,context_scope,context_data FROM ai_jobs WHERE id=$1`,
      [jobId],
    );
    assert.equal(job.rows[0]?.job_type, "read_only");
    assert.ok(job.rows[0]?.context_scope.includes("recipe_versions"));
    assert.equal(job.rows[0]?.context_data.recipeVersionComparison?.schemaVersion, "recipe-version-compare-v1");
    assert.equal(job.rows[0]?.context_data.policy?.readOnly, true);

    console.log("Recipe Version analysis integration passed.");
  } finally {
    if (jobId) await db.query("DELETE FROM ai_jobs WHERE id=$1", [jobId]).catch(() => undefined);
    if (recipeId) await db.query("DELETE FROM recipes WHERE id=$1", [recipeId]).catch(() => undefined);
    if (staffId) await db.query("DELETE FROM staff_users WHERE id=$1", [staffId]).catch(() => undefined);
    if (variantId) await db.query("DELETE FROM catalog_variants WHERE id=$1", [variantId]).catch(() => undefined);
    if (productId) await db.query("DELETE FROM catalog_products WHERE id=$1", [productId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
