import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { getDb } from "../../db/pool.js";
import { writeAdminAuditLog } from "../admin/admin-audit.js";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission, type PermissionKey } from "../auth/auth.permissions.js";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors.js";
import {
  applyApprovedRecipeDraft,
  getAiDraft,
  listAiDraftReviewQueue,
  listOwnAiDrafts,
  reviewAiDraft,
} from "./ai-draft.service.js";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

const querySchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  scopes: z.array(z.enum(["orders", "customers", "catalog", "recipes"])).min(1).max(4),
  recipeId: z.string().uuid().optional(),
});

const draftSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  draftType: z.enum(["recipe", "customer_reply", "catalog_copy", "operations_note"]),
  title: z.string().trim().min(1).max(200),
  scopes: z.array(z.enum(["orders", "customers", "catalog", "recipes"])).default([]),
  recipeId: z.string().uuid().optional(),
}).superRefine((input, ctx) => {
  if (input.draftType === "recipe" && !input.recipeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recipeId"], message: "recipeId is required for recipe drafts." });
  }
  if (input.draftType === "recipe" && !input.scopes.includes("recipes")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scopes"], message: "Recipe drafts require the recipes scope." });
  }
});

const actionSchema = z.object({
  actionKey: z.literal("append_order_internal_note"),
  targetId: z.string().uuid(),
  payload: z.object({ note: z.string().trim().min(1).max(4000) }),
  reason: z.string().trim().min(3).max(500),
  sourceInteractionId: z.string().uuid().optional(),
  sourceDraftId: z.string().uuid().optional(),
});

const approvalSchema = z.object({ note: z.string().trim().min(3).max(500) });
const draftApplySchema = z.object({
  selectedStepIds: z.array(z.string().regex(/^step-\d{3}$/)).min(1).max(100),
});

function requireActiveStaff(identity: RequestIdentity): StaffIdentity {
  if (identity.kind !== "staff" || !identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required");
  }
  return identity;
}

function requestMeta(req: Request) {
  return {
    requestId: String(req.headers["x-request-id"] ?? "").trim() || null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") ?? null,
  };
}

function sendError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "INVALID_REQUEST", details: error.flatten() });
    return;
  }
  console.error("AI request failed", error);
  res.status(500).json({ error: "AI_REQUEST_FAILED" });
}

async function buildReadOnlyContext(identity: StaffIdentity, scopes: string[], recipeId?: string) {
  const db = getDb();
  const context: Record<string, unknown> = {};

  if (scopes.includes("orders")) {
    await requirePermission(identity, "orders.view");
    const result = await db.query(
      `SELECT status, count(*)::int AS count, COALESCE(sum(total_amount),0)::numeric AS total_amount
       FROM orders GROUP BY status ORDER BY status`,
    );
    context.orders = result.rows;
  }
  if (scopes.includes("customers")) {
    await requirePermission(identity, "customers.view");
    const result = await db.query(
      `SELECT approval_status, count(*)::int AS count
       FROM customers GROUP BY approval_status ORDER BY approval_status`,
    );
    context.customers = result.rows;
  }
  if (scopes.includes("catalog")) {
    await requirePermission(identity, "catalog.view");
    const result = await db.query(
      `SELECT p.name AS product_name, v.name AS variant_name, v.sku, v.retail_price, v.shop_price, v.status
       FROM catalog_variants v
       JOIN catalog_products p ON p.id = v.product_id
       WHERE v.is_active = true
       ORDER BY p.updated_at DESC, v.updated_at DESC
       LIMIT 100`,
    );
    context.catalog = result.rows;
  }
  if (scopes.includes("recipes")) {
    await requirePermission(identity, "recipes.view");
    if (recipeId) {
      const [recipeResult, ingredientResult, stepResult] = await Promise.all([
        db.query(
          `SELECT
             recipe.id::text AS id,
             recipe.slug,
             recipe.title,
             recipe.short_description AS "shortDescription",
             recipe.description,
             recipe.related_brand AS "relatedBrand",
             recipe.yield_quantity AS "yieldQuantity",
             recipe.yield_unit AS "yieldUnit",
             recipe.status,
             recipe.visibility,
             recipe.recipe_kind AS "recipeKind",
             recipe.operational_notes AS "operationalNotes",
             recipe.current_version_id::text AS "currentVersionId",
             current_version.version_no AS "currentVersionNo",
             recipe.updated_at AS "updatedAt"
           FROM recipes recipe
           LEFT JOIN recipe_versions current_version ON current_version.id = recipe.current_version_id
           WHERE recipe.id = $1`,
          [recipeId],
        ),
        db.query(
          `SELECT
             product_name AS "productName",
             quantity,
             unit,
             note,
             optional,
             catalog_variant_id::text AS "catalogVariantId",
             source_type AS "sourceType",
             catalog_key AS "catalogKey",
             source_recipe_slug AS "sourceRecipeSlug"
           FROM recipe_ingredients
           WHERE recipe_id = $1
           ORDER BY sort_order, created_at`,
          [recipeId],
        ),
        db.query(
          `SELECT
             step_no AS "stepNo",
             title,
             COALESCE(content, instruction) AS content,
             image_url AS "imageUrl"
           FROM recipe_steps
           WHERE recipe_id = $1
           ORDER BY step_no`,
          [recipeId],
        ),
      ]);
      if (!recipeResult.rows[0]) {
        throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found");
      }
      if (!recipeResult.rows[0].currentVersionId) {
        throw new OrderEngineError("RECIPE_VERSION_MISSING", 409, "Recipe does not have a current version.");
      }
      context.recipe = {
        ...recipeResult.rows[0],
        ingredients: ingredientResult.rows,
        steps: stepResult.rows,
      };
    } else {
      const result = await db.query(
        `SELECT slug, title, status, visibility, recipe_kind, updated_at
         FROM recipes ORDER BY updated_at DESC LIMIT 100`,
      );
      context.recipes = result.rows;
    }
  }

  return context;
}

export function assertDifferentApprover(requesterStaffId: string, approverStaffId: string): void {
  if (requesterStaffId === approverStaffId) {
    throw new OrderEngineError("SELF_APPROVAL_FORBIDDEN", 409, "Requester cannot approve their own AI action");
  }
}

export function createAiRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/query", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      const input = querySchema.parse(req.body ?? {});
      const context = await buildReadOnlyContext(identity, input.scopes, input.recipeId);
      const result = await getDb().query<{ id: string }>(
        `INSERT INTO ai_jobs(
           staff_user_id, job_type, prompt, context_scope, context_data
         ) VALUES($1,'read_only',$2,$3,$4::jsonb)
         RETURNING id::text`,
        [identity.staffId, input.prompt, input.scopes, JSON.stringify(context)],
      );
      res.status(202).json({ jobId: result.rows[0].id, status: "pending" });
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.execute");
      const input = draftSchema.parse(req.body ?? {});
      const context = await buildReadOnlyContext(identity, input.scopes, input.recipeId);
      const result = await getDb().query<{ id: string }>(
        `INSERT INTO ai_jobs(
           staff_user_id, job_type, prompt, context_scope, context_data,
           draft_type, draft_title
         ) VALUES($1,'draft',$2,$3,$4::jsonb,$5,$6)
         RETURNING id::text`,
        [identity.staffId, input.prompt, input.scopes, JSON.stringify(context), input.draftType, input.title],
      );
      res.status(202).json({ jobId: result.rows[0].id, status: "pending" });
    } catch (error) { sendError(res, error); }
  });

  router.get("/jobs", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      const result = await getDb().query(
        `SELECT id::text, job_type, status, attempt_count, max_attempts,
                draft_type, draft_title, interaction_id::text, draft_id::text,
                response_text, provider, model, error_code, error_message,
                created_at, started_at, completed_at, updated_at
         FROM ai_jobs
         WHERE staff_user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [identity.staffId],
      );
      res.json({ jobs: result.rows });
    } catch (error) { sendError(res, error); }
  });

  router.get("/jobs/:jobId", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      const result = await getDb().query(
        `SELECT id::text, job_type, status, attempt_count, max_attempts,
                draft_type, draft_title, interaction_id::text, draft_id::text,
                response_text, provider, model, error_code, error_message,
                created_at, started_at, completed_at, updated_at
         FROM ai_jobs
         WHERE id = $1 AND staff_user_id = $2`,
        [req.params.jobId, identity.staffId],
      );
      if (!result.rows[0]) throw new OrderEngineError("AI_JOB_NOT_FOUND", 404, "AI job not found");
      res.json({ job: result.rows[0] });
    } catch (error) { sendError(res, error); }
  });

  router.get("/drafts/review-queue", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.audit");
      await requirePermission(identity, "recipes.review");
      res.json(await listAiDraftReviewQueue());
    } catch (error) { sendError(res, error); }
  });

  router.get("/drafts", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      const recipeId = req.query.recipeId === undefined
        ? null
        : z.string().uuid().parse(req.query.recipeId);
      res.json(await listOwnAiDrafts(identity, { recipeId }));
    } catch (error) { sendError(res, error); }
  });

  router.get("/drafts/:draftId", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      const payload = await getAiDraft(req.params.draftId);
      if (payload.draft.createdByStaffId === identity.staffId) {
        await requirePermission(identity, "ai.use");
      } else {
        await requirePermission(identity, "ai.audit");
        if (payload.draft.draftType === "recipe") await requirePermission(identity, "recipes.review");
      }
      res.json(payload);
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts/:draftId/approve", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.audit");
      await requirePermission(identity, "recipes.review");
      const input = approvalSchema.parse(req.body ?? {});
      res.json(await reviewAiDraft(identity, req.params.draftId, "approved", input.note, requestMeta(req)));
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts/:draftId/reject", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.audit");
      await requirePermission(identity, "recipes.review");
      const input = approvalSchema.parse(req.body ?? {});
      res.json(await reviewAiDraft(identity, req.params.draftId, "rejected", input.note, requestMeta(req)));
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts/:draftId/apply", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.execute");
      await requirePermission(identity, "recipes.edit");
      await requirePermission(identity, "recipes.media.manage");
      const input = draftApplySchema.parse(req.body ?? {});
      res.json(await applyApprovedRecipeDraft(identity, req.params.draftId, input.selectedStepIds, requestMeta(req)));
    } catch (error) { sendError(res, error); }
  });

  router.post("/actions", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.execute");
      const input = actionSchema.parse(req.body ?? {});
      const requiredPermission: PermissionKey = "orders.internal_notes";
      const client = await getDb().connect();
      try {
        await client.query("BEGIN");
        const order = await client.query(`SELECT id FROM orders WHERE id=$1`, [input.targetId]);
        if (!order.rows[0]) throw new OrderEngineError("ORDER_NOT_FOUND", 404, "Order was not found");
        const result = await client.query<{ id: string }>(
          `INSERT INTO ai_action_requests(requested_by_staff_id,source_interaction_id,source_draft_id,action_key,required_permission_key,target_type,target_id,payload,requested_reason)
           VALUES($1,$2,$3,$4,$5,'order',$6,$7::jsonb,$8) RETURNING id::text`,
          [identity.staffId, input.sourceInteractionId ?? null, input.sourceDraftId ?? null, input.actionKey, requiredPermission, input.targetId, JSON.stringify(input.payload), input.reason],
        );
        await client.query(
          `INSERT INTO ai_action_events(action_request_id,event_type,actor_staff_id,note,metadata)
           VALUES($1,'requested',$2,$3,'{}'::jsonb)`,
          [result.rows[0].id, identity.staffId, input.reason],
        );
        await client.query("COMMIT");
        res.status(201).json({ actionRequestId: result.rows[0].id, status: "pending", requiredPermission });
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    } catch (error) { sendError(res, error); }
  });

  router.get("/actions", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.audit");
      const result = await getDb().query(
        `SELECT id::text,requested_by_staff_id::text,action_key,required_permission_key,target_type,target_id,payload,status,requested_reason,approved_by_staff_id::text,approved_at,approval_note,executed_at,execution_result,error_message,created_at
         FROM ai_action_requests ORDER BY created_at DESC LIMIT 200`,
      );
      res.json({ actions: result.rows });
    } catch (error) { sendError(res, error); }
  });

  router.post("/actions/:actionId/approve", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      const input = approvalSchema.parse(req.body ?? {});
      const meta = requestMeta(req);
      const client = await getDb().connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<{
          id: string; requested_by_staff_id: string; action_key: string; required_permission_key: PermissionKey;
          target_id: string; payload: { note: string }; status: string;
        }>(`SELECT id::text,requested_by_staff_id::text,action_key,required_permission_key,target_id,payload,status
            FROM ai_action_requests WHERE id=$1 FOR UPDATE`, [req.params.actionId]);
        const action = result.rows[0];
        if (!action) throw new OrderEngineError("AI_ACTION_NOT_FOUND", 404, "AI action request not found");
        if (action.status !== "pending") throw new OrderEngineError("AI_ACTION_NOT_PENDING", 409, "AI action is not pending");
        assertDifferentApprover(action.requested_by_staff_id, identity.staffId);
        await requirePermission(identity, action.required_permission_key);
        if (action.action_key !== "append_order_internal_note") throw new OrderEngineError("AI_ACTION_UNSUPPORTED", 400, "Unsupported AI action");

        const order = await client.query<{ internal_note: string | null }>(`SELECT internal_note FROM orders WHERE id=$1 FOR UPDATE`, [action.target_id]);
        if (!order.rows[0]) throw new OrderEngineError("ORDER_NOT_FOUND", 404, "Order was not found");
        const previous = order.rows[0].internal_note;
        const next = action.payload.note;
        await client.query(`UPDATE orders SET internal_note=$2,updated_at=now() WHERE id=$1`, [action.target_id, next]);
        await client.query(
          `INSERT INTO order_internal_note_logs(order_id,previous_note,new_note,actor_type,actor_id)
           VALUES($1,$2,$3,'staff',$4)`,
          [action.target_id, previous, next, identity.clerkUserId],
        );
        await client.query(
          `UPDATE ai_action_requests SET status='executed',approved_by_staff_id=$2,approved_at=now(),approval_note=$3,executed_by_staff_id=$2,executed_at=now(),execution_result=$4::jsonb,updated_at=now() WHERE id=$1`,
          [action.id, identity.staffId, input.note, JSON.stringify({ previousNote: previous, newNote: next })],
        );
        await client.query(
          `INSERT INTO ai_action_events(action_request_id,event_type,actor_staff_id,note,metadata)
           VALUES($1,'approved',$2,$3,'{}'::jsonb),($1,'executed',$2,$3,'{}'::jsonb)`,
          [action.id, identity.staffId, input.note],
        );
        await writeAdminAuditLog({
          actorStaffId: identity.staffId,
          actionKey: "ai.action.execute",
          resourceType: "order",
          resourceId: action.target_id,
          outcome: "success",
          permissionKey: action.required_permission_key,
          reason: input.note,
          beforeData: { internalNote: previous },
          afterData: { internalNote: next },
          metadata: { aiActionRequestId: action.id, actionKey: action.action_key },
          requestId: meta.requestId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }, client);
        await client.query("COMMIT");
        res.json({ ok: true, status: "executed" });
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    } catch (error) { sendError(res, error); }
  });

  router.post("/actions/:actionId/reject", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.audit");
      const input = approvalSchema.parse(req.body ?? {});
      const result = await getDb().query(
        `UPDATE ai_action_requests SET status='rejected',approved_by_staff_id=$2,approved_at=now(),approval_note=$3,updated_at=now()
         WHERE id=$1 AND status='pending' AND requested_by_staff_id<>$2 RETURNING id::text`,
        [req.params.actionId, identity.staffId, input.note],
      );
      if (!result.rows[0]) throw new OrderEngineError("AI_ACTION_REJECT_FAILED", 409, "Action is not pending or self-rejection is forbidden");
      await getDb().query(`INSERT INTO ai_action_events(action_request_id,event_type,actor_staff_id,note,metadata) VALUES($1,'rejected',$2,$3,'{}'::jsonb)`, [req.params.actionId, identity.staffId, input.note]);
      res.json({ ok: true, status: "rejected" });
    } catch (error) { sendError(res, error); }
  });

  return router;
}
