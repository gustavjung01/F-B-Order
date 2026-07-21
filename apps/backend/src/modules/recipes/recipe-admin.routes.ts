import type { Request, Response } from "express";
import { Router } from "express";
import { requireAdmin } from "../admin/admin-access";
import type { RequestIdentity } from "../auth/auth.identity";
import { requirePermission } from "../auth/auth.permissions";
import { isOrderEngineError } from "../orders/order-errors";
import { listAdminRecipesStable } from "./recipe-admin-list.service";
import {
  archiveAdminRecipe,
  createAdminRecipe,
  getAdminRecipe,
  listAdminRecipeVersions,
  publishRecipe,
  reviewRecipe,
  submitRecipeForReview,
  updateAdminRecipe,
} from "./recipe-admin.service";
import { searchRecipeCatalogOptionsWithImages } from "./recipe-catalog-options.service";
import {
  completeRecipeMediaUpload,
  createRecipeImageUpload,
  createRecipeMediaDraft,
  deleteRecipeMedia,
  detachRecipeMedia,
  getRecipeCatalogMedia,
  getRecipeMediaReferences,
  syncRecipeMedia,
} from "./recipe-media.service";
import {
  assertRecipeMediaNotReferencedByVersion,
  recordCurrentRecipeVersionMediaReferences,
} from "./recipe-media-version-reference.service";
import { scaleAdminRecipe } from "./recipe-scale.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendRecipeError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  console.error("admin recipe request failed", error);
  res.status(500).json({
    error: "ADMIN_RECIPE_REQUEST_FAILED",
    message: "Không tải được dữ liệu công thức. Vui lòng kiểm tra migration và log backend.",
  });
}

export function createAdminRecipesRouter(identityResolver: IdentityResolver) {
  const router = Router();

  // Static routes must stay above /:recipeId so they are never parsed as a UUID.
  router.get("/catalog-options", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.view");
      res.json(await searchRecipeCatalogOptionsWithImages(identity, { search: req.query.q, limit: req.query.limit }));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/media/catalog", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.view");
      res.json(await getRecipeCatalogMedia(identity, { variantIds: req.query.variantIds }));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/media/drafts", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.media.manage");
      res.status(201).json(await createRecipeMediaDraft(identity, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/media/presign", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.media.manage");
      res.status(201).json(await createRecipeImageUpload(identity, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/media/sync", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.media.manage");
      const result = await syncRecipeMedia(identity, req.body ?? {});
      const versionReference = await recordCurrentRecipeVersionMediaReferences(
        result.recipeId,
        result.coverMediaId,
        result.steps,
      );
      res.json({ ...result, versionReference });
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/media/recipe/:recipeId", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.view");
      res.json(await getRecipeMediaReferences(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/media/:mediaId/complete", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.media.manage");
      res.json(await completeRecipeMediaUpload(identity, req.params.mediaId, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/media/:mediaId/detach", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.media.manage");
      res.json(await detachRecipeMedia(identity, req.params.mediaId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.delete("/media/:mediaId", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.media.manage");
      await assertRecipeMediaNotReferencedByVersion(req.params.mediaId);
      res.json(await deleteRecipeMedia(identity, req.params.mediaId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.view");
      const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      res.json(await listAdminRecipesStable(identity, {
        status: req.query.status,
        search: req.query.q,
        limit: Number.isFinite(limit) ? limit : 50,
      }));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.edit");
      res.status(201).json(await createAdminRecipe(identity, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/:recipeId/versions", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.view");
      res.json(await listAdminRecipeVersions(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/scale", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.view");
      res.json(await scaleAdminRecipe(identity, req.params.recipeId, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/submit-review", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.edit");
      res.json(await submitRecipeForReview(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/review", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.review");
      res.json(await reviewRecipe(identity, req.params.recipeId, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.post("/:recipeId/publish", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.publish");
      res.json(await publishRecipe(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.get("/:recipeId", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.view");
      res.json(await getAdminRecipe(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.patch("/:recipeId", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.edit");
      res.json(await updateAdminRecipe(identity, req.params.recipeId, req.body ?? {}));
    } catch (error) { sendRecipeError(res, error); }
  });

  router.delete("/:recipeId", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "recipes.edit");
      res.json(await archiveAdminRecipe(identity, req.params.recipeId));
    } catch (error) { sendRecipeError(res, error); }
  });

  return router;
}
