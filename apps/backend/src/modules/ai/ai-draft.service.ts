import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool.js";
import { writeAdminAuditLog } from "../admin/admin-audit.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { OrderEngineError } from "../orders/order-errors.js";
import { readRecipeSopDraftContent } from "./ai-draft-content.js";

export type AiRequestMeta = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type AiDraftStatus = "draft" | "approved" | "rejected" | "applied" | "archived";

type AiDraftRow = {
  id: string;
  createdByStaffId: string;
  draftType: "recipe" | "customer_reply" | "catalog_copy" | "operations_note";
  title: string;
  content: unknown;
  status: AiDraftStatus;
  targetRecipeId: string | null;
  baseRecipeVersionId: string | null;
  reviewedByStaffId: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  appliedByStaffId: string | null;
  appliedAt: Date | null;
  appliedRecipeVersionId: string | null;
  applicationData: unknown;
};

const DRAFT_SELECT = `
  SELECT
    draft.id::text,
    draft.created_by_staff_id::text AS "createdByStaffId",
    draft.draft_type AS "draftType",
    draft.title,
    draft.content,
    draft.status,
    draft.target_recipe_id::text AS "targetRecipeId",
    draft.base_recipe_version_id::text AS "baseRecipeVersionId",
    draft.reviewed_by_staff_id::text AS "reviewedByStaffId",
    draft.reviewed_at AS "reviewedAt",
    draft.review_note AS "reviewNote",
    draft.applied_by_staff_id::text AS "appliedByStaffId",
    draft.applied_at AS "appliedAt",
    draft.applied_recipe_version_id::text AS "appliedRecipeVersionId",
    draft.application_data AS "applicationData",
    draft.source_interaction_id::text AS "sourceInteractionId",
    draft.created_at AS "createdAt",
    draft.updated_at AS "updatedAt",
    creator.name AS "createdByName",
    reviewer.name AS "reviewedByName",
    applier.name AS "appliedByName",
    recipe.title AS "recipeTitle",
    applied_version.version_no AS "appliedRecipeVersionNo"
  FROM ai_drafts draft
  LEFT JOIN staff_users creator ON creator.id = draft.created_by_staff_id
  LEFT JOIN staff_users reviewer ON reviewer.id = draft.reviewed_by_staff_id
  LEFT JOIN staff_users applier ON applier.id = draft.applied_by_staff_id
  LEFT JOIN recipes recipe ON recipe.id = draft.target_recipe_id
  LEFT JOIN recipe_versions applied_version ON applied_version.id = draft.applied_recipe_version_id
`;

function normalizeDraftId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new OrderEngineError("INVALID_AI_DRAFT_ID", 400, "draftId must be a UUID.");
  }
  return normalized;
}

function assertDifferentReviewer(creatorStaffId: string, reviewerStaffId: string): void {
  if (creatorStaffId === reviewerStaffId) {
    throw new OrderEngineError(
      "SELF_APPROVAL_FORBIDDEN",
      409,
      "AI draft creator cannot review their own draft.",
    );
  }
}

async function selectDraftForUpdate(client: PoolClient, draftId: string): Promise<AiDraftRow> {
  const result = await client.query<AiDraftRow>(
    `SELECT
       id::text,
       created_by_staff_id::text AS "createdByStaffId",
       draft_type AS "draftType",
       title,
       content,
       status,
       target_recipe_id::text AS "targetRecipeId",
       base_recipe_version_id::text AS "baseRecipeVersionId",
       reviewed_by_staff_id::text AS "reviewedByStaffId",
       reviewed_at AS "reviewedAt",
       review_note AS "reviewNote",
       applied_by_staff_id::text AS "appliedByStaffId",
       applied_at AS "appliedAt",
       applied_recipe_version_id::text AS "appliedRecipeVersionId",
       application_data AS "applicationData"
     FROM ai_drafts
     WHERE id = $1
     FOR UPDATE`,
    [draftId],
  );
  const draft = result.rows[0];
  if (!draft) throw new OrderEngineError("AI_DRAFT_NOT_FOUND", 404, "AI draft was not found.");
  return draft;
}

export async function listOwnAiDrafts(
  identity: StaffIdentity,
  input: { recipeId?: string | null } = {},
  db: Pool = getDb(),
) {
  const values: unknown[] = [identity.staffId];
  const filters = ["draft.created_by_staff_id = $1"];
  if (input.recipeId) {
    values.push(input.recipeId);
    filters.push(`draft.target_recipe_id = $${values.length}::uuid`);
  }
  const result = await db.query(
    `${DRAFT_SELECT}
     WHERE ${filters.join(" AND ")}
     ORDER BY draft.created_at DESC
     LIMIT 100`,
    values,
  );
  return { drafts: result.rows };
}

export async function listAiDraftReviewQueue(
  identity: StaffIdentity,
  db: Pool = getDb(),
) {
  const result = await db.query(
    `${DRAFT_SELECT}
     WHERE draft.draft_type = 'recipe'
       AND draft.created_by_staff_id <> $1
       AND draft.status IN ('draft', 'approved', 'rejected', 'applied')
     ORDER BY
       CASE draft.status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       draft.created_at DESC
     LIMIT 200`,
    [identity.staffId],
  );
  return { drafts: result.rows };
}

export async function getAiDraft(draftId: string, db: Pool = getDb()) {
  const id = normalizeDraftId(draftId);
  const result = await db.query(
    `${DRAFT_SELECT}
     WHERE draft.id = $1`,
    [id],
  );
  if (!result.rows[0]) throw new OrderEngineError("AI_DRAFT_NOT_FOUND", 404, "AI draft was not found.");
  return { draft: result.rows[0] };
}

export async function reviewAiDraft(
  identity: StaffIdentity,
  draftId: string,
  decision: "approved" | "rejected",
  note: string,
  meta: AiRequestMeta,
  db: Pool = getDb(),
) {
  const id = normalizeDraftId(draftId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const draft = await selectDraftForUpdate(client, id);
    if (draft.status !== "draft") {
      throw new OrderEngineError("AI_DRAFT_NOT_REVIEWABLE", 409, "AI draft is no longer awaiting review.");
    }
    assertDifferentReviewer(draft.createdByStaffId, identity.staffId);

    await client.query(
      `UPDATE ai_drafts
       SET status = $2,
           reviewed_by_staff_id = $3,
           reviewed_at = now(),
           review_note = $4,
           updated_at = now()
       WHERE id = $1`,
      [id, decision, identity.staffId, note],
    );
    await client.query(
      `INSERT INTO ai_draft_events(draft_id,event_type,actor_staff_id,note,metadata)
       VALUES($1,$2,$3,$4,$5::jsonb)`,
      [id, decision, identity.staffId, note, JSON.stringify({ draftType: draft.draftType, targetRecipeId: draft.targetRecipeId })],
    );
    await writeAdminAuditLog({
      actorStaffId: identity.staffId,
      actionKey: `ai.draft.${decision === "approved" ? "approve" : "reject"}`,
      resourceType: "ai_draft",
      resourceId: id,
      outcome: "success",
      permissionKey: "ai.approve",
      reason: note,
      beforeData: { status: draft.status },
      afterData: { status: decision },
      metadata: { targetRecipeId: draft.targetRecipeId, draftType: draft.draftType },
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }, client);
    await client.query("COMMIT");
    return getAiDraft(id, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function applyApprovedRecipeDraft(
  identity: StaffIdentity,
  draftId: string,
  selectedStepIds: string[],
  meta: AiRequestMeta,
  db: Pool = getDb(),
) {
  const id = normalizeDraftId(draftId);
  const uniqueSelectedIds = [...new Set(selectedStepIds)];
  if (!uniqueSelectedIds.length || uniqueSelectedIds.length !== selectedStepIds.length) {
    throw new OrderEngineError(
      "AI_DRAFT_SELECTION_INVALID",
      400,
      "Select at least one unique SOP proposal step.",
    );
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const draft = await selectDraftForUpdate(client, id);
    if (draft.draftType !== "recipe") {
      throw new OrderEngineError("AI_DRAFT_TYPE_UNSUPPORTED", 400, "Only recipe drafts can be applied here.");
    }
    if (draft.status !== "approved") {
      throw new OrderEngineError("AI_DRAFT_NOT_APPROVED", 409, "AI draft must be approved before application.");
    }
    if (!draft.targetRecipeId || !draft.baseRecipeVersionId) {
      throw new OrderEngineError("AI_DRAFT_TARGET_MISSING", 409, "AI recipe draft is missing its target or base version.");
    }

    const content = readRecipeSopDraftContent(draft.content);
    if (content.targetRecipeId !== draft.targetRecipeId || content.baseRecipeVersionId !== draft.baseRecipeVersionId) {
      throw new OrderEngineError("AI_DRAFT_TARGET_MISMATCH", 409, "Stored AI draft target does not match its workflow metadata.");
    }

    const proposalById = new Map(content.proposal.steps.map((step) => [step.id, step]));
    const selected = uniqueSelectedIds.map((stepId) => {
      const step = proposalById.get(stepId);
      if (!step) {
        throw new OrderEngineError("AI_DRAFT_STEP_NOT_FOUND", 400, `Unknown proposal step: ${stepId}`);
      }
      return step;
    });

    const recipeResult = await client.query<{
      id: string;
      status: string;
      currentVersionId: string | null;
      publishedVersionId: string | null;
    }>(
      `SELECT
         id::text,
         status,
         current_version_id::text AS "currentVersionId",
         published_version_id::text AS "publishedVersionId"
       FROM recipes
       WHERE id = $1
       FOR UPDATE`,
      [draft.targetRecipeId],
    );
    const recipe = recipeResult.rows[0];
    if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
    if (recipe.status === "inactive") {
      throw new OrderEngineError("RECIPE_ARCHIVED", 409, "Archived recipes cannot receive an AI draft.");
    }
    if (recipe.currentVersionId !== draft.baseRecipeVersionId) {
      throw new OrderEngineError(
        "AI_DRAFT_STALE",
        409,
        "Recipe has changed since this AI draft was generated. Create a new draft from the latest version.",
        { baseRecipeVersionId: draft.baseRecipeVersionId, currentRecipeVersionId: recipe.currentVersionId },
      );
    }

    const versionResult = await client.query<{
      snapshot: Record<string, unknown> | null;
      workflowStatus: string;
    }>(
      `SELECT snapshot, workflow_status AS "workflowStatus"
       FROM recipe_versions
       WHERE id = $1 AND recipe_id = $2`,
      [draft.baseRecipeVersionId, draft.targetRecipeId],
    );
    const baseVersion = versionResult.rows[0];
    if (!baseVersion?.snapshot || typeof baseVersion.snapshot !== "object") {
      throw new OrderEngineError("RECIPE_VERSION_SNAPSHOT_MISSING", 409, "Current recipe version snapshot is missing.");
    }
    if (["in_review", "approved"].includes(baseVersion.workflowStatus)) {
      throw new OrderEngineError(
        "RECIPE_REVIEW_LOCKED",
        409,
        "Recipe is in review or approved. Request changes before applying an AI draft.",
      );
    }

    const stepResult = await client.query<{
      stepNo: number;
      title: string | null;
      content: string;
      imageUrl: string | null;
      mediaId: string | null;
    }>(
      `SELECT
         step_no AS "stepNo",
         title,
         content,
         image_url AS "imageUrl",
         media_id::text AS "mediaId"
       FROM recipe_steps
       WHERE recipe_id = $1
       ORDER BY step_no
       FOR UPDATE`,
      [draft.targetRecipeId],
    );
    const currentSteps = stepResult.rows.map((step) => ({ ...step }));
    let nextStepNo = currentSteps.reduce((max, step) => Math.max(max, step.stepNo), 0) + 1;

    for (const proposal of selected) {
      if (proposal.currentStepNo) {
        const target = currentSteps.find((step) => step.stepNo === proposal.currentStepNo);
        if (!target) {
          throw new OrderEngineError("AI_DRAFT_STEP_STALE", 409, `Recipe step ${proposal.currentStepNo} no longer exists.`);
        }
        target.title = proposal.title;
        target.content = proposal.content;
        await client.query(
          `UPDATE recipe_steps
           SET title = $3, content = $4
           WHERE recipe_id = $1 AND step_no = $2`,
          [draft.targetRecipeId, proposal.currentStepNo, proposal.title, proposal.content],
        );
      } else {
        const appended = {
          stepNo: nextStepNo++,
          title: proposal.title,
          content: proposal.content,
          imageUrl: null,
          mediaId: null,
        };
        currentSteps.push(appended);
        await client.query(
          `INSERT INTO recipe_steps(recipe_id,step_no,title,content,image_url,media_id)
           VALUES($1,$2,$3,$4,NULL,NULL)`,
          [draft.targetRecipeId, appended.stepNo, appended.title, appended.content],
        );
      }
    }

    currentSteps.sort((left, right) => left.stepNo - right.stepNo);
    const nextSnapshot = {
      ...baseVersion.snapshot,
      steps: currentSteps.map((step) => ({
        title: step.title,
        content: step.content,
        imageUrl: step.imageUrl,
      })),
    };
    const nextVersionNoResult = await client.query<{ nextVersionNo: number }>(
      `SELECT COALESCE(MAX(version_no), 0)::int + 1 AS "nextVersionNo"
       FROM recipe_versions
       WHERE recipe_id = $1`,
      [draft.targetRecipeId],
    );
    const nextVersionNo = nextVersionNoResult.rows[0]?.nextVersionNo ?? 1;
    const insertedVersion = await client.query<{ id: string }>(
      `INSERT INTO recipe_versions(
         recipe_id,version_no,workflow_status,snapshot,change_note,created_by_staff_id
       ) VALUES($1,$2,'draft',$3::jsonb,$4,$5)
       RETURNING id::text`,
      [
        draft.targetRecipeId,
        nextVersionNo,
        JSON.stringify(nextSnapshot),
        `Áp dụng ${selected.length} phần từ AI draft ${id}`,
        identity.staffId,
      ],
    );
    const versionId = insertedVersion.rows[0].id;

    await client.query(
      `UPDATE recipes
       SET current_version_id = $2,
           status = CASE WHEN published_version_id IS NULL THEN 'draft' ELSE 'active' END,
           updated_by_staff_id = $3,
           updated_at = now()
       WHERE id = $1`,
      [draft.targetRecipeId, versionId, identity.staffId],
    );

    await client.query(
      `INSERT INTO recipe_media_version_refs(version_id,media_id,usage,step_no)
       SELECT $2, recipe.cover_media_id, 'cover', NULL
       FROM recipes recipe
       WHERE recipe.id = $1 AND recipe.cover_media_id IS NOT NULL
       UNION ALL
       SELECT $2, step.media_id, 'step', step.step_no
       FROM recipe_steps step
       WHERE step.recipe_id = $1 AND step.media_id IS NOT NULL`,
      [draft.targetRecipeId, versionId],
    );

    const applicationData = {
      selectedStepIds: uniqueSelectedIds,
      selectedStepCount: selected.length,
      baseRecipeVersionId: draft.baseRecipeVersionId,
      appliedRecipeVersionId: versionId,
      appliedRecipeVersionNo: nextVersionNo,
    };
    await client.query(
      `UPDATE ai_drafts
       SET status = 'applied',
           applied_by_staff_id = $2,
           applied_at = now(),
           applied_recipe_version_id = $3,
           application_data = $4::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [id, identity.staffId, versionId, JSON.stringify(applicationData)],
    );
    await client.query(
      `INSERT INTO ai_draft_events(draft_id,event_type,actor_staff_id,note,metadata)
       VALUES($1,'applied',$2,$3,$4::jsonb)`,
      [id, identity.staffId, `Áp dụng ${selected.length} phần vào Recipe version ${nextVersionNo}`, JSON.stringify(applicationData)],
    );
    await writeAdminAuditLog({
      actorStaffId: identity.staffId,
      actionKey: "ai.draft.apply.recipe",
      resourceType: "recipe",
      resourceId: draft.targetRecipeId,
      outcome: "success",
      permissionKey: "ai.execute",
      reason: `Apply approved AI draft ${id}`,
      beforeData: { currentRecipeVersionId: draft.baseRecipeVersionId },
      afterData: { currentRecipeVersionId: versionId, versionNo: nextVersionNo },
      metadata: { aiDraftId: id, selectedStepIds: uniqueSelectedIds },
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }, client);

    await client.query("COMMIT");
    return {
      ok: true,
      draftId: id,
      recipeId: draft.targetRecipeId,
      recipeVersionId: versionId,
      recipeVersionNo: nextVersionNo,
      selectedStepCount: selected.length,
      status: "applied" as const,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
