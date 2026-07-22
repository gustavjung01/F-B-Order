import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool.js";
import { buildRecipeSopDraftContent } from "../src/modules/ai/ai-draft-content.js";
import { applyApprovedRecipeDraft, reviewAiDraft } from "../src/modules/ai/ai-draft.service.js";
import type { StaffIdentity } from "../src/modules/auth/auth.identity.js";
import { createAdminRecipe } from "../src/modules/recipes/recipe-admin.service.js";

const meta = { requestId: "ai-draft-workflow-test", ipAddress: null, userAgent: "integration-test" };

async function expectErrorCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
  });
}

async function insertStaff(label: string, suffix: string): Promise<StaffIdentity> {
  const clerkUserId = `ai-draft-${label}-${suffix}`;
  const result = await getDb().query<{ id: string }>(
    `INSERT INTO staff_users(clerk_user_id,email,name,role,is_active)
     VALUES($1,$2,$3,'admin',true)
     RETURNING id::text`,
    [clerkUserId, `${label}-${suffix}@example.com`, `AI Draft ${label}`],
  );
  return {
    kind: "staff",
    clerkUserId,
    staffId: result.rows[0].id,
    role: "admin",
    isActive: true,
  };
}

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const staffIds: string[] = [];
  let productId: string | null = null;
  let variantId: string | null = null;
  let recipeId: string | null = null;
  let mediaDraftId: string | null = null;
  let mediaId: string | null = null;
  const draftIds: string[] = [];

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
         'hung-phat-v2',$1,'Trà fixture AI draft','Bếp Sỉ','Nguyên liệu trà sữa',
         'nguyen-lieu-tra-sua','Trà','ai-draft-workflow-test','[]'::jsonb,
         'active',999998,'tra'
       ) RETURNING id::text`,
      [`ai-draft-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,catalog_version,variant_key,sku,name,options,price_mode,price_label,
         retail_price,shop_price,status,is_active,is_public,is_orderable,sort_order
       ) VALUES(
         $1,'hung-phat-v2',$2,$3,'Gói 1kg','{"size":"1kg"}'::jsonb,
         'fixed',NULL,NULL,100000,'active',true,true,true,999998
       ) RETURNING id::text`,
      [productId, `ai-draft-variant-${suffix}`, `AID-${suffix.slice(0, 20)}`],
    );
    variantId = variant.rows[0].id;

    const created = await createAdminRecipe(creator, {
      slug: `ai-draft-recipe-${suffix}`,
      title: "Trà AI Draft Workflow",
      shortDescription: "Integration fixture",
      description: "Không được tồn tại sau test.",
      yieldQuantity: 1,
      yieldUnit: "ly",
      changeNote: "Base version",
      ingredients: [{ catalogVariantId: variantId, quantity: 20, unit: "g" }],
      steps: [
        { title: "Ủ trà", content: "Ủ trà trong 8 phút.", imageUrl: "https://example.com/base-step.webp" },
        { title: "Hoàn thiện", content: "Rót ra ly và kiểm tra.", imageUrl: null },
      ],
    }, db);
    recipeId = String(created.recipe.id);
    const baseVersionId = String(created.recipe.currentVersionId);

    const mediaDraft = await db.query<{ id: string }>(
      `INSERT INTO recipe_media_drafts(recipe_id,status,created_by_staff_id,attached_at)
       VALUES($1,'attached',$2,now()) RETURNING id::text`,
      [recipeId, creator.staffId],
    );
    mediaDraftId = mediaDraft.rows[0].id;
    const media = await db.query<{ id: string }>(
      `INSERT INTO recipe_media(
         draft_id,recipe_id,purpose,object_key,thumbnail_object_key,public_url,thumbnail_url,
         content_type,status,created_by_staff_id,uploaded_at,attached_at
       ) VALUES($1,$2,'step',$3,$4,$5,$6,'image/webp','attached',$7,now(),now())
       RETURNING id::text`,
      [
        mediaDraftId,
        recipeId,
        `tests/ai-draft-${suffix}.webp`,
        `tests/ai-draft-${suffix}-thumb.webp`,
        `https://cdn.bepsi.click/tests/ai-draft-${suffix}.webp`,
        `https://cdn.bepsi.click/tests/ai-draft-${suffix}-thumb.webp`,
        creator.staffId,
      ],
    );
    mediaId = media.rows[0].id;
    await db.query(
      `UPDATE recipe_steps SET media_id=$2 WHERE recipe_id=$1 AND step_no=1`,
      [recipeId, mediaId],
    );
    await db.query(
      `INSERT INTO recipe_media_version_refs(version_id,media_id,usage,step_no)
       VALUES($1,$2,'step',1)`,
      [baseVersionId, mediaId],
    );

    const draftContent = buildRecipeSopDraftContent(
      JSON.stringify({
        steps: [
          { title: "Ủ trà", content: "Ủ trà 10 phút ở 92°C; nước trà phải trong và thơm." },
          { title: "QC thành phẩm", content: "Đo nhiệt độ, kiểm tra màu và loại bỏ mẻ đục." },
        ],
      }),
      {
        recipe: {
          id: recipeId,
          currentVersionId: baseVersionId,
          steps: [
            { stepNo: 1, title: "Ủ trà", content: "Ủ trà trong 8 phút.", imageUrl: "https://example.com/base-step.webp" },
            { stepNo: 2, title: "Hoàn thiện", content: "Rót ra ly và kiểm tra.", imageUrl: null },
          ],
        },
      },
    );
    assert.equal(draftContent.proposal.steps[0]?.currentStepNo, 1);
    assert.equal(draftContent.proposal.steps[1]?.currentStepNo, 2);

    const insertedDraft = await db.query<{ id: string }>(
      `INSERT INTO ai_drafts(
         created_by_staff_id,draft_type,title,content,status,target_recipe_id,base_recipe_version_id
       ) VALUES($1,'recipe',$2,$3::jsonb,'draft',$4,$5)
       RETURNING id::text`,
      [creator.staffId, "SOP AI integration", JSON.stringify(draftContent), recipeId, baseVersionId],
    );
    const draftId = insertedDraft.rows[0].id;
    draftIds.push(draftId);

    await expectErrorCode(
      () => reviewAiDraft(creator, draftId, "approved", "Tự duyệt không hợp lệ", meta, db),
      "SELF_APPROVAL_FORBIDDEN",
    );

    const approved = await reviewAiDraft(
      reviewer,
      draftId,
      "approved",
      "Đã đối chiếu SOP và đồng ý cho áp từng phần.",
      meta,
      db,
    );
    assert.equal(approved.draft.status, "approved");
    assert.equal(approved.draft.reviewedByStaffId, reviewer.staffId);

    const selectedStepId = draftContent.proposal.steps[0].id;
    const applied = await applyApprovedRecipeDraft(applier, draftId, [selectedStepId], meta, db);
    assert.equal(applied.status, "applied");
    assert.equal(applied.recipeVersionNo, 2);
    assert.equal(applied.selectedStepCount, 1);

    const appliedDraft = await db.query<{
      status: string;
      applied_recipe_version_id: string;
      application_data: { selectedStepIds: string[] };
    }>(
      `SELECT status,applied_recipe_version_id::text,application_data
       FROM ai_drafts WHERE id=$1`,
      [draftId],
    );
    assert.equal(appliedDraft.rows[0].status, "applied");
    assert.deepEqual(appliedDraft.rows[0].application_data.selectedStepIds, [selectedStepId]);

    const steps = await db.query<{ step_no: number; content: string; media_id: string | null }>(
      `SELECT step_no,content,media_id::text FROM recipe_steps WHERE recipe_id=$1 ORDER BY step_no`,
      [recipeId],
    );
    assert.equal(steps.rows.length, 2, "Partial apply must not add unselected proposal steps.");
    assert.match(steps.rows[0].content, /10 phút/);
    assert.equal(steps.rows[0].media_id, mediaId, "Existing step media ID must remain attached.");
    assert.equal(steps.rows[1].content, "Rót ra ly và kiểm tra.");

    const versionMedia = await db.query(
      `SELECT media_id::text,usage,step_no
       FROM recipe_media_version_refs
       WHERE version_id=$1`,
      [applied.recipeVersionId],
    );
    assert.deepEqual(versionMedia.rows, [{ media_id: mediaId, usage: "step", step_no: 1 }]);

    await expectErrorCode(
      () => applyApprovedRecipeDraft(applier, draftId, [selectedStepId], meta, db),
      "AI_DRAFT_NOT_APPROVED",
    );

    const currentVersion = await db.query<{ current_version_id: string; snapshot: unknown; version_no: number }>(
      `SELECT recipe.current_version_id::text,version.snapshot,version.version_no
       FROM recipes recipe JOIN recipe_versions version ON version.id=recipe.current_version_id
       WHERE recipe.id=$1`,
      [recipeId],
    );
    const staleContent = buildRecipeSopDraftContent(
      JSON.stringify({ steps: [{ title: "Ủ trà", content: "Đề xuất sẽ bị stale." }] }),
      {
        recipe: {
          id: recipeId,
          currentVersionId: currentVersion.rows[0].current_version_id,
          steps: steps.rows.map((step) => ({
            stepNo: step.step_no,
            title: step.step_no === 1 ? "Ủ trà" : "Hoàn thiện",
            content: step.content,
            imageUrl: null,
          })),
        },
      },
    );
    const staleDraftResult = await db.query<{ id: string }>(
      `INSERT INTO ai_drafts(
         created_by_staff_id,draft_type,title,content,status,target_recipe_id,base_recipe_version_id
       ) VALUES($1,'recipe','Stale SOP',$2::jsonb,'draft',$3,$4)
       RETURNING id::text`,
      [creator.staffId, JSON.stringify(staleContent), recipeId, currentVersion.rows[0].current_version_id],
    );
    const staleDraftId = staleDraftResult.rows[0].id;
    draftIds.push(staleDraftId);
    await reviewAiDraft(reviewer, staleDraftId, "approved", "Duyệt để kiểm tra stale guard.", meta, db);

    const manualVersion = await db.query<{ id: string }>(
      `INSERT INTO recipe_versions(recipe_id,version_no,workflow_status,snapshot,change_note,created_by_staff_id)
       VALUES($1,$2,'draft',$3::jsonb,'Concurrent manual version',$4)
       RETURNING id::text`,
      [recipeId, currentVersion.rows[0].version_no + 1, JSON.stringify(currentVersion.rows[0].snapshot), creator.staffId],
    );
    await db.query(`UPDATE recipes SET current_version_id=$2 WHERE id=$1`, [recipeId, manualVersion.rows[0].id]);

    await expectErrorCode(
      () => applyApprovedRecipeDraft(applier, staleDraftId, [staleContent.proposal.steps[0].id], meta, db),
      "AI_DRAFT_STALE",
    );

    const events = await db.query<{ event_type: string }>(
      `SELECT event_type FROM ai_draft_events WHERE draft_id=$1 ORDER BY created_at`,
      [draftId],
    );
    assert.deepEqual(events.rows.map((row) => row.event_type), ["approved", "applied"]);

    console.log("AI draft review and partial Recipe apply integration passed.");
  } finally {
    if (draftIds.length) {
      await db.query("DELETE FROM ai_drafts WHERE id=ANY($1::uuid[])", [draftIds]).catch(() => undefined);
    }
    if (recipeId) await db.query("DELETE FROM recipes WHERE id=$1", [recipeId]).catch(() => undefined);
    if (mediaId) await db.query("DELETE FROM recipe_media WHERE id=$1", [mediaId]).catch(() => undefined);
    if (mediaDraftId) await db.query("DELETE FROM recipe_media_drafts WHERE id=$1", [mediaDraftId]).catch(() => undefined);
    for (const staffId of staffIds) {
      await db.query("DELETE FROM staff_users WHERE id=$1", [staffId]).catch(() => undefined);
    }
    if (variantId) await db.query("DELETE FROM catalog_variants WHERE id=$1", [variantId]).catch(() => undefined);
    if (productId) await db.query("DELETE FROM catalog_products WHERE id=$1", [productId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
