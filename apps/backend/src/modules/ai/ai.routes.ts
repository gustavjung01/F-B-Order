import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { getDb } from "../../db/pool.js";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission, type PermissionKey } from "../auth/auth.permissions.js";
import { writeAdminAuditLog } from "../admin/admin-audit.js";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors.js";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

const querySchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  scopes: z.array(z.enum(["orders", "customers", "catalog", "recipes"])).min(1).max(4),
});

const draftSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  draftType: z.enum(["recipe", "customer_reply", "catalog_copy", "operations_note"]),
  title: z.string().trim().min(1).max(200),
  scopes: z.array(z.enum(["orders", "customers", "catalog", "recipes"])).default([]),
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

async function buildReadOnlyContext(identity: StaffIdentity, scopes: string[]) {
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
    const result = await db.query(
      `SELECT slug, title, status, visibility, recipe_kind, updated_at
       FROM recipes ORDER BY updated_at DESC LIMIT 100`,
    );
    context.recipes = result.rows;
  }

  return context;
}

async function generateText(prompt: string, context: unknown, mode: "read_only" | "draft") {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  if (!apiKey) {
    return {
      provider: "deterministic",
      model: null,
      text: mode === "read_only"
        ? `Đã tổng hợp dữ liệu theo yêu cầu: ${prompt}`
        : `Bản nháp được tạo từ yêu cầu: ${prompt}`,
      data: { context },
      usage: {},
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: mode === "read_only"
            ? "Bạn là trợ lý vận hành Bếp Sỉ. Chỉ phân tích dữ liệu được cung cấp, không đề xuất đã thực thi hành động. Trả lời tiếng Việt, nêu số liệu và giới hạn dữ liệu."
            : "Bạn là trợ lý soạn bản nháp Bếp Sỉ. Chỉ tạo nội dung nháp, không tuyên bố đã cập nhật hệ thống. Trả lời tiếng Việt, có cấu trúc rõ ràng.",
        },
        { role: "user", content: `${prompt}\n\nDữ liệu được backend cho phép:\n${JSON.stringify(context)}` },
      ],
    }),
  });
  if (!response.ok) {
    throw new OrderEngineError("AI_PROVIDER_FAILED", 502, `AI provider returned ${response.status}`);
  }
  const payload = await response.json() as { output_text?: string; usage?: unknown };
  return {
    provider: "openai",
    model,
    text: payload.output_text || "Không có nội dung trả về.",
    data: { context },
    usage: payload.usage ?? {},
  };
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
      const context = await buildReadOnlyContext(identity, input.scopes);
      const generated = await generateText(input.prompt, context, "read_only");
      const result = await getDb().query<{ id: string }>(
        `INSERT INTO ai_interactions(staff_user_id,mode,prompt,context_scope,provider,model,response_text,response_data,token_usage)
         VALUES($1,'read_only',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING id::text`,
        [identity.staffId, input.prompt, input.scopes, generated.provider, generated.model, generated.text, JSON.stringify(generated.data), JSON.stringify(generated.usage)],
      );
      res.json({ interactionId: result.rows[0].id, response: generated.text, provider: generated.provider });
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.execute");
      const input = draftSchema.parse(req.body ?? {});
      const context = await buildReadOnlyContext(identity, input.scopes);
      const generated = await generateText(input.prompt, context, "draft");
      const client = await getDb().connect();
      try {
        await client.query("BEGIN");
        const interaction = await client.query<{ id: string }>(
          `INSERT INTO ai_interactions(staff_user_id,mode,prompt,context_scope,provider,model,response_text,response_data,token_usage)
           VALUES($1,'draft',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) RETURNING id::text`,
          [identity.staffId, input.prompt, input.scopes, generated.provider, generated.model, generated.text, JSON.stringify(generated.data), JSON.stringify(generated.usage)],
        );
        const draft = await client.query<{ id: string }>(
          `INSERT INTO ai_drafts(created_by_staff_id,draft_type,title,content,source_interaction_id)
           VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id::text`,
          [identity.staffId, input.draftType, input.title, JSON.stringify({ text: generated.text, context }), interaction.rows[0].id],
        );
        await client.query("COMMIT");
        res.status(201).json({ draftId: draft.rows[0].id, interactionId: interaction.rows[0].id, content: generated.text });
      } catch (error) {
        await client.query("ROLLBACK"); throw error;
      } finally { client.release(); }
    } catch (error) { sendError(res, error); }
  });

  router.get("/drafts", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      const result = await getDb().query(
        `SELECT id::text,draft_type,title,content,status,review_note,created_at,updated_at
         FROM ai_drafts WHERE created_by_staff_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [identity.staffId],
      );
      res.json({ drafts: result.rows });
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
