import type { Request, Response } from "express";
import { Router } from "express";
import { requireAdmin } from "../admin/admin-access";
import type { RequestIdentity } from "../auth/auth.identity";
import { requirePermission } from "../auth/auth.permissions";
import { isOrderEngineError } from "../orders/order-errors";
import {
  compareAdminRecipeVersions,
  enqueueRecipeVersionAnalysis,
} from "./recipe-version-compare.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  console.error("Recipe Version analysis failed", error);
  res.status(500).json({
    error: "RECIPE_VERSION_ANALYSIS_FAILED",
    message: "Không phân tích được thay đổi giữa các Recipe Version.",
  });
}

export function createRecipeVersionAnalysisRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/compare", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      await requirePermission(identity, "recipes.view");
      await requirePermission(identity, "catalog.view");
      const input = req.body ?? {};
      res.json({
        comparison: await compareAdminRecipeVersions(identity, input.recipeId, input),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/analyze", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      await requirePermission(identity, "recipes.view");
      await requirePermission(identity, "catalog.view");
      await requirePermission(identity, "ai.use");
      const input = req.body ?? {};
      res.status(202).json(await enqueueRecipeVersionAnalysis(identity, input.recipeId, input));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
