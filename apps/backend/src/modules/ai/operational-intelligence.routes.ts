import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { getDb } from "../../db/pool.js";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission } from "../auth/auth.permissions.js";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors.js";
import { buildOperationalContext } from "./operational-context.js";

const operationalScopeSchema = z.enum(["catalog", "cost", "inventory", "suppliers"]);

const contextRequestSchema = z.object({
  scopes: z.array(operationalScopeSchema).min(1).max(4),
  recipeId: z.string().uuid().optional(),
});

const queryRequestSchema = contextRequestSchema.extend({
  prompt: z.string().trim().min(3).max(4000),
});

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function requireActiveStaff(identity: RequestIdentity): StaffIdentity {
  if (identity.kind !== "staff" || !identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required");
  }
  return identity;
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
  console.error("Operational intelligence request failed", error);
  res.status(500).json({ error: "OPERATIONAL_INTELLIGENCE_FAILED" });
}

export function createOperationalIntelligenceRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/context", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      const input = contextRequestSchema.parse(req.body ?? {});
      const context = await buildOperationalContext(identity, input.scopes, input.recipeId);
      res.json({ context });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/query", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "ai.use");
      const input = queryRequestSchema.parse(req.body ?? {});
      const context = await buildOperationalContext(identity, input.scopes, input.recipeId);
      const result = await getDb().query<{ id: string }>(
        `INSERT INTO ai_jobs(
           staff_user_id, job_type, prompt, context_scope, context_data
         ) VALUES($1,'read_only',$2,$3,$4::jsonb)
         RETURNING id::text`,
        [
          identity.staffId,
          input.prompt,
          input.scopes,
          JSON.stringify({
            kind: "operational_intelligence",
            instruction: "Use only the supplied context. Treat empty readiness scopes as unavailable data and never invent stock, supplier prices, MOQ, lead times, or Recipe cost.",
            ...context,
          }),
        ],
      );
      res.status(202).json({ jobId: result.rows[0].id, status: "pending" });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
