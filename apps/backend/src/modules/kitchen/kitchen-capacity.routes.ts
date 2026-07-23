import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../admin/admin-access.js";
import type { RequestIdentity } from "../auth/auth.identity.js";
import { requirePermission } from "../auth/auth.permissions.js";
import { isOrderEngineError } from "../orders/order-errors.js";
import {
  enqueueKitchenCapacityAnalysis,
  getKitchenCapacityProfile,
  saveKitchenCapacityProfile,
  simulateKitchenCapacity,
} from "./kitchen-capacity.service.js";

const uuid = z.string().uuid();
const nullableText = z.string().trim().max(2000).nullable().optional();

const profileStepSchema = z.object({
  recipeStepNo: z.number().int().min(1).max(1000),
  stepName: z.string().trim().min(1).max(240),
  stationName: z.string().trim().min(1).max(180),
  stationParallelSlots: z.number().int().min(1).max(1000),
  stationAvailableWorkers: z.number().int().min(1).max(1000),
  equipmentName: z.string().trim().max(180).nullable().optional(),
  equipmentQuantity: z.number().int().min(1).max(1000).nullable().optional(),
  cycleMinutes: z.number().positive().max(100000),
  laborMinutes: z.number().min(0).max(100000),
  outputPerRun: z.number().positive().max(100000000),
  workersRequired: z.number().int().min(1).max(1000),
  equipmentUnitsRequired: z.number().int().min(0).max(1000).optional(),
  notes: nullableText,
});

const profileSchema = z.object({
  recipeId: uuid,
  batchOutputQuantity: z.number().positive().max(100000000),
  batchOutputUnit: z.string().trim().min(1).max(80),
  setupMinutes: z.number().min(0).max(100000).optional(),
  notes: nullableText,
  steps: z.array(profileStepSchema).min(1).max(100),
});

const simulationSchema = z.object({
  recipeId: uuid,
  versionId: uuid.optional(),
  targetQuantity: z.number().positive().max(100000000),
  shiftMinutes: z.number().positive().max(10080),
  extraWorkersPerStation: z.number().int().min(0).max(1000).optional(),
  extraEquipmentPerType: z.number().int().min(0).max(1000).optional(),
});

const analysisSchema = simulationSchema.extend({
  prompt: z.string().trim().min(3).max(4000).optional(),
});

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "INVALID_REQUEST", details: error.flatten() });
    return;
  }
  console.error("Kitchen capacity request failed", error);
  res.status(500).json({ error: "KITCHEN_CAPACITY_REQUEST_FAILED" });
}

export function createKitchenCapacityRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/profile", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "kitchen.capacity.view");
      const recipeId = uuid.parse(req.query.recipeId);
      const versionId = req.query.versionId ? uuid.parse(req.query.versionId) : undefined;
      res.json({ profile: await getKitchenCapacityProfile(identity, recipeId, versionId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put("/profiles/:versionId", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "kitchen.capacity.manage");
      const versionId = uuid.parse(req.params.versionId);
      const input = profileSchema.parse(req.body ?? {});
      res.json({ profile: await saveKitchenCapacityProfile(identity, input.recipeId, versionId, input) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/simulate", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "kitchen.capacity.view");
      const input = simulationSchema.parse(req.body ?? {});
      res.json({ result: await simulateKitchenCapacity(identity, input) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/analyze", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "kitchen.capacity.view");
      await requirePermission(identity, "ai.use");
      const input = analysisSchema.parse(req.body ?? {});
      res.status(202).json(await enqueueKitchenCapacityAnalysis(identity, input));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
