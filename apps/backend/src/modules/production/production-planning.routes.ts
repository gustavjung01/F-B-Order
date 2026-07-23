import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission } from "../auth/auth.permissions.js";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors.js";
import { buildProductionPlan, enqueueProductionPlanAnalysis } from "./production-planning.service.js";

const planLineSchema = z.object({
  recipeId: z.string().uuid(),
  versionId: z.string().uuid().nullable().optional(),
  targetQuantity: z.coerce.number().positive().max(100000000),
});

const planSchema = z.object({
  shiftMinutes: z.coerce.number().positive().max(10080),
  lines: z.array(planLineSchema).min(1).max(20),
});

const analyzeSchema = planSchema.extend({
  prompt: z.string().trim().max(4000).nullable().optional(),
});

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function requireActiveStaff(identity: RequestIdentity): StaffIdentity {
  if (identity.kind !== "staff" || !identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required.");
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
  console.error("Production planning request failed", error);
  res.status(500).json({ error: "PRODUCTION_PLAN_REQUEST_FAILED" });
}

async function requirePlanDataPermissions(identity: StaffIdentity): Promise<void> {
  await requirePermission(identity, "production.plan.view");
  await requirePermission(identity, "recipes.view");
  await requirePermission(identity, "kitchen.capacity.view");
  await requirePermission(identity, "inventory.view");
  await requirePermission(identity, "suppliers.view");
}

export function createProductionPlanningRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/preview", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePlanDataPermissions(identity);
      const input = planSchema.parse(req.body ?? {});
      res.json({ plan: await buildProductionPlan(identity, input) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/analyze", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePlanDataPermissions(identity);
      await requirePermission(identity, "production.plan.analyze");
      await requirePermission(identity, "ai.use");
      await requirePermission(identity, "ai.execute");
      const input = analyzeSchema.parse(req.body ?? {});
      res.status(202).json(await enqueueProductionPlanAnalysis(identity, input));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
