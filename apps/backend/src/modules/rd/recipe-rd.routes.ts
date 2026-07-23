import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission } from "../auth/auth.permissions.js";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors.js";
import { reviewRecipeRdDraft } from "./recipe-rd-review.service.js";
import {
  applyApprovedRecipeRdDraft,
  createRecipeRdRequest,
  listRecipeRdRequests,
  recordRecipeRdTrialResult,
} from "./recipe-rd.service.js";

const constraintsSchema = z.object({
  maxCostPerYield: z.coerce.number().positive().nullable().optional(),
  preserveYield: z.boolean().default(false),
  useAvailableInventoryOnly: z.boolean().default(false),
  maxIngredientCount: z.coerce.number().int().positive().max(250).nullable().optional(),
});

const createRequestSchema = z.object({
  recipeId: z.string().uuid(),
  objective: z.string().trim().min(3).max(2000),
  constraints: constraintsSchema.default({}),
  additionalNotes: z.string().trim().max(2000).nullable().optional(),
});

const trialSchema = z.object({
  resultStatus: z.enum(["planned", "passed", "needs_changes", "failed"]),
  batchQuantity: z.coerce.number().positive().nullable().optional(),
  batchUnit: z.string().trim().min(1).max(80).nullable().optional(),
  sensoryScore: z.coerce.number().min(0).max(10).nullable().optional(),
  operationalScore: z.coerce.number().min(0).max(10).nullable().optional(),
  measurements: z.record(z.unknown()).default({}),
  note: z.string().trim().max(4000).nullable().optional(),
});

const reviewSchema = z.object({ note: z.string().trim().min(3).max(500) });

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function requireActiveStaff(identity: RequestIdentity): StaffIdentity {
  if (identity.kind !== "staff" || !identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required.");
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
  console.error("Recipe R&D request failed", error);
  res.status(500).json({ error: "RECIPE_RD_REQUEST_FAILED" });
}

export function createRecipeRdRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/requests", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "recipe.rd.view");
      res.json(await listRecipeRdRequests(identity));
    } catch (error) { sendError(res, error); }
  });

  router.post("/requests", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "recipe.rd.create");
      await requirePermission(identity, "ai.execute");
      await requirePermission(identity, "recipes.view");
      await requirePermission(identity, "catalog.view");
      await requirePermission(identity, "inventory.view");
      await requirePermission(identity, "suppliers.view");
      await requirePermission(identity, "kitchen.capacity.view");
      const input = createRequestSchema.parse(req.body ?? {});
      res.status(202).json(await createRecipeRdRequest(identity, input));
    } catch (error) { sendError(res, error); }
  });

  router.post("/requests/:requestId/trials", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "recipe.rd.create");
      const input = trialSchema.parse(req.body ?? {});
      res.status(201).json(await recordRecipeRdTrialResult(identity, req.params.requestId, input));
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts/:draftId/approve", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "recipe.rd.review");
      await requirePermission(identity, "ai.approve");
      const input = reviewSchema.parse(req.body ?? {});
      res.json(await reviewRecipeRdDraft(identity, req.params.draftId, "approved", input.note, requestMeta(req)));
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts/:draftId/reject", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "recipe.rd.review");
      await requirePermission(identity, "ai.approve");
      const input = reviewSchema.parse(req.body ?? {});
      res.json(await reviewRecipeRdDraft(identity, req.params.draftId, "rejected", input.note, requestMeta(req)));
    } catch (error) { sendError(res, error); }
  });

  router.post("/drafts/:draftId/apply", async (req, res) => {
    try {
      const identity = requireActiveStaff(await identityResolver(req));
      await requirePermission(identity, "recipe.rd.apply");
      await requirePermission(identity, "ai.execute");
      await requirePermission(identity, "recipes.edit");
      res.json(await applyApprovedRecipeRdDraft(identity, req.params.draftId, requestMeta(req)));
    } catch (error) { sendError(res, error); }
  });

  return router;
}
