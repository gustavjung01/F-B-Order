import type { Request, Response } from "express";
import { Router } from "express";
import { requireAdmin } from "../admin/admin-access";
import type { RequestIdentity } from "../auth/auth.identity";
import { isOrderEngineError } from "../orders/order-errors";
import {
  archiveAdminRecipe,
  createAdminRecipe,
  getAdminRecipe,
  listAdminRecipeVersions,
  listAdminRecipes,
  publishRecipe,
  reviewRecipe,
  searchRecipeCatalogOptions,
  submitRecipeForReview,
  updateAdminRecipe,
} from "./recipe-admin.service";
import { scaleAdminRecipe } from "./recipe-scale.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendRecipeError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  console.error("admin recipe request failed", error);
  res.status(500).json({ error: "ADMIN_RECIPE_REQUEST_FAILED" });
}

export function createAdminRecipesRouter(identityResolver: IdentityResolver) {
  const router = Router();

  // Static routes must stay above /:recipeId so they are never parsed as a UUID.
  router.get("/catalog-options", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await searchRecipeCatalogOptions(identity, { search: req.query.q, limit: req.query.limit }));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      res.json(await listAdminRecipes(identity, {
        status: req.query.status,
        search: req.query.q,
        limit: Number.isFinite(limit) ? limit : 50,
      }));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.status(201).json(await createAdminRecipe(identity, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/:recipeId/versions", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await listAdminRecipeVersions(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/scale", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await scaleAdminRecipe(identity, req.params.recipeId, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/submit-review", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await submitRecipeForReview(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/review", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await reviewRecipe(identity, req.params.recipeId, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/publish", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await publishRecipe(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/:recipeId", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await getAdminRecipe(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.patch("/:recipeId", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await updateAdminRecipe(identity, req.params.recipeId, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.delete("/:recipeId", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      res.json(await archiveAdminRecipe(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  return router;
}
