import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool.js";
import type { StaffIdentity } from "../src/modules/auth/auth.identity.js";
import { saveKitchenCapacityProfile } from "../src/modules/kitchen/kitchen-capacity.service.js";
import { createAdminRecipe } from "../src/modules/recipes/recipe-admin.service.js";
import {
  buildRecipeRdDraftContent,
  parseGeneratedRecipeRdProposal,
  type RecipeRdConstraints,
  type RecipeRdDraftContent,
} from "../src/modules/rd/recipe-rd-content.js";
import { reviewRecipeRdDraft } from "../src/modules/rd/recipe-rd-review.service.js";
import {
  applyApprovedRecipeRdDraft,
  createRecipeRdRequest,
  recordRecipeRdTrialResult,
} from "../src/modules/rd/recipe-rd.service.js";

const db = getDb();
const meta = { requestId: "recipe-rd-integration", ipAddress: null, userAgent: "integration-test" };

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && error.code === code));
}

async function insertStaff(label: string, suffix: string): Promise<StaffIdentity> {
  const clerkUserId = `recipe-rd-${label}-${suffix}`;
  const result = await db.query<{ id: string }>(
    `INSERT INTO staff_users(clerk_user_id,email,name,role,is_active)
     VALUES($1,$2,$3,'admin',true) RETURNING id::text`,
    [clerkUserId, `${label}-${suffix}@example.com`, `Recipe R&D ${label}`],
  );
  return {
    kind: "staff",
    clerkUserId,
    staffId: result.rows[0].id,
    role: "admin",
    isActive: true,
  };
}

function proposal(variantId: string, objective: string): string {
  return JSON.stringify({
    title: "Phương án R&D trà sữa",
    rationale: "Giữ yield, kiểm soát cost và xác minh bằng mẻ thử.",
    proposal: {
      yieldQuantity: 10,
      yieldUnit: "ly",
      ingredients: [{
        productName: "Trà fixture",
        catalogVariantId: variantId,
        quantity: 100,
        unit: "g",
        optional: false,
        note: "Định lượng proposal",
      }],
      steps: [
        { title: "Ủ trà", content: `Ủ trà theo batch - ${objective}.` },
        { title: "Hoàn thiện", content: "Rót đủ yield và ghi nhận mẻ thử." },
      ],
    },
    expectedEffects: ["Cost nằm trong giới hạn."],
    risks: ["Cần mẻ thử để xác nhận cảm quan."],
    testPlan: [{ metric: "Cost mỗi ly", target: "Không vượt trần", method: "Đối chiếu cost backend" }],
  });
}

type GeneratedDraft = {
  requestId: string;
  jobId: string;
  draftId: string;
  content: RecipeRdDraftContent;
  context: unknown;
};

async function generateDraft(
  creator: StaffIdentity,
  recipeId: string,
  variantId: string,
  objective: string,
  constraints: RecipeRdConstraints,
): Promise<GeneratedDraft> {
  const request = await createRecipeRdRequest(creator, {
    recipeId,
    objective,
    constraints,
    additionalNotes: "Phase 6 integration fixture",
  }, db);
  const job = await db.query<{ contextData: unknown }>(
    `SELECT context_data AS "contextData" FROM ai_jobs WHERE id=$1`,
    [request.jobId],
  );
  assert.ok(job.rows[0]?.contextData);
  const context = job.rows[0].contextData;
  const generatedText = proposal(variantId, objective);
  const content = buildRecipeRdDraftContent(generatedText, context);
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO ai_drafts(
       created_by_staff_id,draft_type,title,content,status,target_recipe_id,base_recipe_version_id
     ) VALUES($1,'recipe',$2,$3::jsonb,'draft',$4,$5) RETURNING id::text`,
    [creator.staffId, `R&D ${objective}`, JSON.stringify(content), content.targetRecipeId, content.baseRecipeVersionId],
  );
  const draftId = inserted.rows[0].id;
  await db.query(
    `INSERT INTO ai_draft_events(draft_id,event_type,actor_staff_id,note,metadata)
     VALUES($1,'generated',$2,'Simulated worker output',$3::jsonb)`,
    [draftId, creator.staffId, JSON.stringify({ jobId: request.jobId, contentKind: content.kind })],
  );
  const linked = await db.query(
    `UPDATE recipe_rd_requests
     SET status='generated',ai_draft_id=$2,failure_code=NULL,failure_message=NULL
     WHERE id=$1 AND ai_job_id=$3`,
    [request.requestId, draftId, request.jobId],
  );
  assert.equal(linked.rowCount, 1);
  await db.query(
    `UPDATE ai_jobs
     SET status='completed',completed_at=now(),draft_id=$2,response_text=$3,
         provider='integration-test',model='fixture',updated_at=now()
     WHERE id=$1`,
    [request.jobId, draftId, generatedText],
  );
  return { requestId: request.requestId, jobId: request.jobId, draftId, content, context };
}

async function main(): Promise<void> {
  const suffix = randomUUID().replaceAll("-", "");
  const staffIds: string[] = [];
  const draftIds: string[] = [];
  const jobIds: string[] = [];
  let productId: string | null = null;
  let variantId: string | null = null;
  let recipeId: string | null = null;
  let locationId: string | null = null;
  let supplierId: string | null = null;

  try {
    const creator = await insertStaff("creator", suffix);
    const reviewer = await insertStaff("reviewer", suffix);
    const applier = await insertStaff("applier", suffix);
    staffIds.push(creator.staffId, reviewer.staffId, applier.staffId);

    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products(
         catalog_version,product_key,name,brand,industry,industry_key,subcategory,
         source_group,option_groups,status,sort_order,catalog_group_key
       ) VALUES(
         'hung-phat-v2',$1,'Trà fixture Recipe R&D','Bếp Sỉ','Nguyên liệu trà sữa',
         'nguyen-lieu-tra-sua','Trà','recipe-rd-test','[]'::jsonb,'active',0,'tra'
       ) RETURNING id::text`,
      [`recipe-rd-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,catalog_version,variant_key,sku,name,options,price_mode,price_label,
         retail_price,shop_price,status,is_active,is_public,is_orderable,sort_order
       ) VALUES(
         $1,'hung-phat-v2',$2,$3,'Gói 1kg','{"size":"1kg"}'::jsonb,
         'fixed',NULL,NULL,100000,'active',true,true,true,0
       ) RETURNING id::text`,
      [productId, `recipe-rd-variant-${suffix}`, `RRD-${suffix.slice(0, 20)}`],
    );
    variantId = variant.rows[0].id;

    const location = await db.query<{ id: string }>(
      `INSERT INTO inventory_locations(location_key,name,status)
       VALUES($1,$2,'active') RETURNING id::text`,
      [`recipe-rd-${suffix}`, `Kho R&D ${suffix}`],
    );
    locationId = location.rows[0].id;
    await db.query(
      `INSERT INTO inventory_balances(
         location_id,catalog_variant_id,on_hand_quantity,reserved_quantity,reorder_point,safety_stock,unit
       ) VALUES($1,$2,20,2,5,2,'package')`,
      [locationId, variantId],
    );

    const supplier = await db.query<{ id: string }>(
      `INSERT INTO suppliers(supplier_code,name,status,default_lead_time_days,currency)
       VALUES($1,$2,'active',2,'VND') RETURNING id::text`,
      [`RRD-${suffix.slice(0, 20)}`, `Nhà cung cấp R&D ${suffix}`],
    );
    supplierId = supplier.rows[0].id;
    await db.query(
      `INSERT INTO supplier_catalog_offers(
         supplier_id,catalog_variant_id,supplier_sku,purchase_price,currency,
         package_quantity,package_unit,minimum_order_quantity,lead_time_days,is_preferred,is_active
       ) VALUES($1,$2,$3,80000,'VND',1,'kg',1,2,true,true)`,
      [supplierId, variantId, `SUP-${suffix.slice(0, 20)}`],
    );

    const created = await createAdminRecipe(creator, {
      slug: `recipe-rd-${suffix}`,
      title: "Trà sữa kiểm thử Recipe R&D",
      shortDescription: "Fixture Phase 6",
      description: "Dữ liệu integration test phải được dọn sau khi chạy.",
      relatedBrand: "Bếp Sỉ",
      yieldQuantity: 10,
      yieldUnit: "ly",
      sortOrder: 0,
      changeNote: "Base version cho R&D",
      ingredients: [{ catalogVariantId: variantId, quantity: 100, unit: "g", optional: false }],
      steps: [
        { title: "Ủ trà", content: "Ủ trà theo batch.", imageUrl: null },
        { title: "Hoàn thiện", content: "Rót đủ 10 ly.", imageUrl: null },
      ],
    }, db);
    recipeId = String(created.recipe.id);
    const publishedVersionId = String(created.recipe.currentVersionId);
    await db.query(
      `UPDATE recipe_versions SET workflow_status='published',published_by_staff_id=$2,published_at=now() WHERE id=$1`,
      [publishedVersionId, creator.staffId],
    );
    await db.query(
      `UPDATE recipes
       SET status='active',published_version_id=$2,published_by_staff_id=$3,published_at=now()
       WHERE id=$1`,
      [recipeId, publishedVersionId, creator.staffId],
    );

    const profile = await saveKitchenCapacityProfile(creator, recipeId, publishedVersionId, {
      batchOutputQuantity: 10,
      batchOutputUnit: "ly",
      setupMinutes: 5,
      notes: "Recipe R&D fixture",
      steps: [
        {
          recipeStepNo: 1,
          stepName: "Ủ trà",
          stationName: `R&D brew ${suffix}`,
          stationParallelSlots: 1,
          stationAvailableWorkers: 1,
          cycleMinutes: 10,
          laborMinutes: 5,
          outputPerRun: 10,
          workersRequired: 1,
          equipmentUnitsRequired: 0,
        },
        {
          recipeStepNo: 2,
          stepName: "Hoàn thiện",
          stationName: `R&D finish ${suffix}`,
          stationParallelSlots: 1,
          stationAvailableWorkers: 1,
          cycleMinutes: 5,
          laborMinutes: 5,
          outputPerRun: 10,
          workersRequired: 1,
          equipmentUnitsRequired: 0,
        },
      ],
    }, db);
    assert.equal(profile.readiness.status, "ready");

    await expectCode(async () => { parseGeneratedRecipeRdProposal("not-json"); }, "AI_RECIPE_RD_INVALID_JSON");
    await expectCode(async () => { parseGeneratedRecipeRdProposal("{}"); }, "AI_RECIPE_RD_INVALID_SHAPE");

    const constraints: RecipeRdConstraints = {
      maxCostPerYield: 1500,
      preserveYield: true,
      useAvailableInventoryOnly: true,
      maxIngredientCount: 2,
    };
    const valid = await generateDraft(creator, recipeId, variantId, "valid proposal", constraints);
    draftIds.push(valid.draftId);
    jobIds.push(valid.jobId);
    assert.equal(valid.content.evaluation.cost.status, "ready");
    assert.equal(valid.content.evaluation.cost.costPerYield, 1000);
    assert.equal(valid.content.evaluation.allRequiredConstraintsMet, true);
    assert.equal(valid.content.evaluation.inventory[0]?.status, "available");
    assert.equal(valid.content.evaluation.capacity.status, "revalidation_required");

    await expectCode(
      async () => { buildRecipeRdDraftContent(proposal(randomUUID(), "forbidden SKU"), valid.context); },
      "AI_RECIPE_RD_CATALOG_VARIANT_FORBIDDEN",
    );
    await expectCode(
      () => applyApprovedRecipeRdDraft(applier, valid.draftId, meta, db),
      "AI_DRAFT_NOT_APPROVED",
    );

    await recordRecipeRdTrialResult(creator, valid.requestId, {
      resultStatus: "planned",
      batchQuantity: 10,
      batchUnit: "ly",
      measurements: { target: "baseline" },
      note: "Lập kế hoạch mẻ thử",
    }, db);
    await expectCode(
      () => reviewRecipeRdDraft(creator, valid.draftId, "approved", "Tự duyệt không hợp lệ", meta, db),
      "SELF_APPROVAL_FORBIDDEN",
    );
    const unchanged = await db.query<{ requestStatus: string; draftStatus: string }>(
      `SELECT request.status AS "requestStatus",draft.status AS "draftStatus"
       FROM recipe_rd_requests request JOIN ai_drafts draft ON draft.id=request.ai_draft_id
       WHERE request.id=$1`,
      [valid.requestId],
    );
    assert.deepEqual(unchanged.rows[0], { requestStatus: "generated", draftStatus: "draft" });

    const approved = await reviewRecipeRdDraft(
      reviewer,
      valid.draftId,
      "approved",
      "Đã đối chiếu catalog, cost, tồn kho và kế hoạch thử.",
      meta,
      db,
    );
    assert.equal(approved.draft.status, "approved");
    const applied = await applyApprovedRecipeRdDraft(applier, valid.draftId, meta, db);
    assert.equal(applied.status, "applied");

    const recipeState = await db.query<{
      currentVersionId: string;
      publishedVersionId: string;
      workflowStatus: string;
    }>(
      `SELECT recipe.current_version_id::text AS "currentVersionId",
              recipe.published_version_id::text AS "publishedVersionId",
              version.workflow_status AS "workflowStatus"
       FROM recipes recipe JOIN recipe_versions version ON version.id=recipe.current_version_id
       WHERE recipe.id=$1`,
      [recipeId],
    );
    assert.equal(recipeState.rows[0].currentVersionId, applied.recipeVersionId);
    assert.equal(recipeState.rows[0].publishedVersionId, publishedVersionId);
    assert.equal(recipeState.rows[0].workflowStatus, "draft");
    await expectCode(
      () => applyApprovedRecipeRdDraft(applier, valid.draftId, meta, db),
      "AI_DRAFT_NOT_APPROVED",
    );

    for (const resultStatus of ["needs_changes", "passed", "failed"] as const) {
      await recordRecipeRdTrialResult(creator, valid.requestId, {
        resultStatus,
        sensoryScore: resultStatus === "passed" ? 8.5 : 6,
        operationalScore: 8,
        measurements: { resultStatus },
        note: `Trial ${resultStatus}`,
      }, db);
    }
    const trialCount = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM recipe_rd_trial_results WHERE rd_request_id=$1`,
      [valid.requestId],
    );
    assert.equal(trialCount.rows[0].count, 4);

    const failed = await generateDraft(
      creator,
      recipeId,
      variantId,
      "constraint failure",
      { ...constraints, maxCostPerYield: 500 },
    );
    draftIds.push(failed.draftId);
    jobIds.push(failed.jobId);
    assert.ok(failed.content.evaluation.constraints.some((item) => item.status === "failed"));
    await reviewRecipeRdDraft(reviewer, failed.draftId, "approved", "Approve to test apply guard.", meta, db);
    await expectCode(
      () => applyApprovedRecipeRdDraft(applier, failed.draftId, meta, db),
      "RECIPE_RD_CONSTRAINT_FAILED",
    );

    const stale = await generateDraft(creator, recipeId, variantId, "stale version", constraints);
    draftIds.push(stale.draftId);
    jobIds.push(stale.jobId);
    await reviewRecipeRdDraft(reviewer, stale.draftId, "approved", "Approve to test stale guard.", meta, db);
    const current = await db.query<{ versionNo: number; snapshot: unknown }>(
      `SELECT version.version_no AS "versionNo",version.snapshot
       FROM recipes recipe JOIN recipe_versions version ON version.id=recipe.current_version_id
       WHERE recipe.id=$1`,
      [recipeId],
    );
    const concurrent = await db.query<{ id: string }>(
      `INSERT INTO recipe_versions(recipe_id,version_no,workflow_status,snapshot,change_note,created_by_staff_id)
       VALUES($1,$2,'draft',$3::jsonb,'Concurrent version',$4) RETURNING id::text`,
      [recipeId, current.rows[0].versionNo + 1, JSON.stringify(current.rows[0].snapshot), creator.staffId],
    );
    await db.query(`UPDATE recipes SET current_version_id=$2 WHERE id=$1`, [recipeId, concurrent.rows[0].id]);
    await expectCode(
      () => applyApprovedRecipeRdDraft(applier, stale.draftId, meta, db),
      "AI_DRAFT_STALE",
    );

    const rejected = await generateDraft(creator, recipeId, variantId, "rejected proposal", constraints);
    draftIds.push(rejected.draftId);
    jobIds.push(rejected.jobId);
    const rejection = await reviewRecipeRdDraft(
      reviewer,
      rejected.draftId,
      "rejected",
      "Từ chối để kiểm tra lifecycle.",
      meta,
      db,
    );
    assert.equal(rejection.draft.status, "rejected");
    const rejectedRequest = await db.query<{ status: string }>(
      `SELECT status FROM recipe_rd_requests WHERE id=$1`,
      [rejected.requestId],
    );
    assert.equal(rejectedRequest.rows[0].status, "rejected");

    const events = await db.query<{ eventType: string }>(
      `SELECT event_type AS "eventType" FROM ai_draft_events WHERE draft_id=$1 ORDER BY created_at,id`,
      [valid.draftId],
    );
    assert.deepEqual(events.rows.map((row) => row.eventType), ["generated", "approved", "applied"]);
    const audits = await db.query<{ actionKey: string }>(
      `SELECT action_key AS "actionKey" FROM admin_audit_logs
       WHERE request_id=$1 AND action_key IN ('recipe.rd.approve','recipe.rd.apply')`,
      [meta.requestId],
    );
    assert.ok(audits.rows.some((row) => row.actionKey === "recipe.rd.approve"));
    assert.ok(audits.rows.some((row) => row.actionKey === "recipe.rd.apply"));

    console.log("Recipe R&D integration passed.");
  } finally {
    if (draftIds.length) await db.query("DELETE FROM ai_drafts WHERE id=ANY($1::uuid[])", [draftIds]).catch(() => undefined);
    if (jobIds.length) await db.query("DELETE FROM ai_jobs WHERE id=ANY($1::uuid[])", [jobIds]).catch(() => undefined);
    if (recipeId) await db.query("DELETE FROM recipes WHERE id=$1", [recipeId]).catch(() => undefined);
    if (locationId) await db.query("DELETE FROM inventory_locations WHERE id=$1", [locationId]).catch(() => undefined);
    if (supplierId) await db.query("DELETE FROM suppliers WHERE id=$1", [supplierId]).catch(() => undefined);
    for (const staffId of staffIds) await db.query("DELETE FROM staff_users WHERE id=$1", [staffId]).catch(() => undefined);
    if (variantId) await db.query("DELETE FROM catalog_variants WHERE id=$1", [variantId]).catch(() => undefined);
    if (productId) await db.query("DELETE FROM catalog_products WHERE id=$1", [productId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
