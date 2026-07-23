import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool.js";
import type { StaffIdentity } from "../src/modules/auth/auth.identity.js";
import { createAdminRecipe } from "../src/modules/recipes/recipe-admin.service.js";
import { recordAuditedRecipeRdTrialResult } from "../src/modules/rd/recipe-rd-trial.service.js";

const db = getDb();
const meta = {
  requestId: "recipe-rd-trial-audit-integration",
  ipAddress: "127.0.0.1",
  userAgent: "recipe-rd-trial-audit-test",
};

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && error.code === code));
}

async function main(): Promise<void> {
  const suffix = randomUUID().replaceAll("-", "");
  let staffId: string | null = null;
  let recipeId: string | null = null;
  const requestIds: string[] = [];

  try {
    const staff = await db.query<{ id: string }>(
      `INSERT INTO staff_users(clerk_user_id,email,name,role,is_active)
       VALUES($1,$2,$3,'admin',true)
       RETURNING id::text`,
      [
        `recipe-rd-trial-${suffix}`,
        `recipe-rd-trial-${suffix}@example.com`,
        "Recipe R&D Trial Auditor",
      ],
    );
    staffId = staff.rows[0].id;
    const identity: StaffIdentity = {
      kind: "staff",
      clerkUserId: `recipe-rd-trial-${suffix}`,
      staffId,
      role: "admin",
      isActive: true,
    };

    const created = await createAdminRecipe(identity, {
      slug: `recipe-rd-trial-${suffix}`,
      title: "Recipe R&D trial audit fixture",
      shortDescription: "Atomic trial audit integration fixture",
      description: "Temporary data created by the Phase 6 integration test.",
      relatedBrand: "Bếp Sỉ",
      yieldQuantity: 10,
      yieldUnit: "ly",
      sortOrder: 0,
      changeNote: "Create fixture for trial audit",
      ingredients: [],
      steps: [{ title: "Ghi nhận", content: "Ghi nhận kết quả mẻ thử.", imageUrl: null }],
    }, db);
    recipeId = String(created.recipe.id);
    const baseRecipeVersionId = String(created.recipe.currentVersionId);

    const generatedRequest = await db.query<{ id: string }>(
      `INSERT INTO recipe_rd_requests(
         created_by_staff_id,recipe_id,base_recipe_version_id,objective,constraints,status
       ) VALUES($1,$2,$3,$4,'{}'::jsonb,'generated')
       RETURNING id::text`,
      [staffId, recipeId, baseRecipeVersionId, "Verify atomic trial audit"],
    );
    const generatedRequestId = generatedRequest.rows[0].id;
    requestIds.push(generatedRequestId);

    const recorded = await recordAuditedRecipeRdTrialResult(identity, generatedRequestId, {
      resultStatus: "passed",
      batchQuantity: 10,
      batchUnit: "ly",
      sensoryScore: 8.5,
      operationalScore: 9,
      measurements: { costPerYield: 1000, source: "integration" },
      note: "Trial đạt và phải có audit cùng transaction.",
    }, meta, db);
    assert.equal(recorded.status, "passed");

    const committed = await db.query<{
      trialResultId: string;
      resultStatus: string;
      actionKey: string;
      resourceId: string;
      requestId: string | null;
      permissionKey: string | null;
    }>(
      `SELECT
         trial.id::text AS "trialResultId",
         trial.result_status AS "resultStatus",
         audit.action_key AS "actionKey",
         audit.resource_id AS "resourceId",
         audit.request_id AS "requestId",
         audit.permission_key AS "permissionKey"
       FROM recipe_rd_trial_results trial
       JOIN admin_audit_logs audit
         ON audit.action_key='recipe.rd.trial.record'
        AND audit.resource_type='recipe_rd_request'
        AND audit.resource_id=trial.rd_request_id::text
        AND audit.after_data->>'trialResultId'=trial.id::text
       WHERE trial.id=$1`,
      [recorded.trialResultId],
    );
    assert.deepEqual(committed.rows[0], {
      trialResultId: recorded.trialResultId,
      resultStatus: "passed",
      actionKey: "recipe.rd.trial.record",
      resourceId: generatedRequestId,
      requestId: meta.requestId,
      permissionKey: "recipe.rd.create",
    });

    await expectCode(
      () => recordAuditedRecipeRdTrialResult(identity, generatedRequestId, {
        resultStatus: "planned",
        batchQuantity: 5,
      }, meta, db),
      "RECIPE_RD_TRIAL_BATCH_INVALID",
    );

    const queuedRequest = await db.query<{ id: string }>(
      `INSERT INTO recipe_rd_requests(
         created_by_staff_id,recipe_id,base_recipe_version_id,objective,constraints,status
       ) VALUES($1,$2,$3,$4,'{}'::jsonb,'queued')
       RETURNING id::text`,
      [staffId, recipeId, baseRecipeVersionId, "Reject trial before proposal generation"],
    );
    const queuedRequestId = queuedRequest.rows[0].id;
    requestIds.push(queuedRequestId);

    await expectCode(
      () => recordAuditedRecipeRdTrialResult(identity, queuedRequestId, {
        resultStatus: "failed",
        note: "This write must roll back.",
      }, meta, db),
      "RECIPE_RD_TRIAL_NOT_ALLOWED",
    );

    const rolledBack = await db.query<{ trials: number; audits: number }>(
      `SELECT
         (SELECT count(*)::int FROM recipe_rd_trial_results WHERE rd_request_id=$1) AS trials,
         (SELECT count(*)::int FROM admin_audit_logs
          WHERE action_key='recipe.rd.trial.record'
            AND resource_type='recipe_rd_request'
            AND resource_id=$1::text) AS audits`,
      [queuedRequestId],
    );
    assert.deepEqual(rolledBack.rows[0], { trials: 0, audits: 0 });

    console.log("Recipe R&D trial audit integration passed.");
  } finally {
    if (requestIds.length) {
      await db.query("DELETE FROM recipe_rd_requests WHERE id=ANY($1::uuid[])", [requestIds]).catch(() => undefined);
    }
    if (recipeId) await db.query("DELETE FROM recipes WHERE id=$1", [recipeId]).catch(() => undefined);
    if (staffId) await db.query("DELETE FROM staff_users WHERE id=$1", [staffId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
