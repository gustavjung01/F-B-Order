import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backendService = await readFile("apps/backend/src/modules/recipes/recipe-media.service.ts", "utf8");
const backendRoutes = await readFile("apps/backend/src/modules/recipes/recipe-admin.routes.ts", "utf8");
const versionReferences = await readFile("apps/backend/src/modules/recipes/recipe-media-version-reference.service.ts", "utf8");
const cleanupScript = await readFile("apps/backend/scripts/cleanup-recipe-media.ts", "utf8");
const publicRoutes = await readFile("apps/backend/src/modules/recipes/recipe-public.routes.ts", "utf8");
const recipePage = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const recipePanel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV5.tsx", "utf8");
const overview = await readFile("apps/frontend/components/admin/recipe-editor/RecipeOverviewTab.tsx", "utf8");
const steps = await readFile("apps/frontend/components/admin/recipe-editor/RecipeStepsTab.tsx", "utf8");
const pickers = await readFile("apps/frontend/components/admin/recipe-editor/RecipePickerDialogs.tsx", "utf8");
const mediaClient = await readFile("apps/frontend/lib/recipe-media-client.ts", "utf8");
const migration = await readFile("db/migrations/019_recipe_media_lifecycle.sql", "utf8");
const corsPolicy = await readFile("infra/cloudflare/r2-recipe-media-cors.json", "utf8");

for (const required of ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "AWS4-HMAC-SHA256", "UNSIGNED-PAYLOAD", "content-type;host"]) {
  assert.ok(backendService.includes(required), `Backend media signing is missing: ${required}`);
}
for (const required of ["createRecipeMediaDraft", "completeRecipeMediaUpload", "syncRecipeMedia", "detachRecipeMedia", "deleteRecipeMedia", "cleanupOrphanRecipeMedia", "thumbnail_object_key", "status = 'attached'", "status = 'detached'", "status = 'deleted'"]) {
  assert.ok(backendService.includes(required), `Backend media lifecycle is missing: ${required}`);
}

const dynamicRecipeIndex = backendRoutes.indexOf('router.get("/:recipeId"');
for (const route of ['router.post("/media/drafts"', 'router.post("/media/presign"', 'router.post("/media/sync"', 'router.get("/media/recipe/:recipeId"', 'router.post("/media/:mediaId/complete"', 'router.post("/media/:mediaId/detach"', 'router.delete("/media/:mediaId"']) {
  const index = backendRoutes.indexOf(route);
  assert.ok(index >= 0 && index < dynamicRecipeIndex, `${route} must stay above /:recipeId.`);
}
assert.match(backendRoutes, /recordCurrentRecipeVersionMediaReferences/);
for (const required of ["recipe_media_version_refs", "VERSION_MEDIA_REFERENCE_SQL", "RECIPE_MEDIA_VERSION_REFERENCE_EXISTS", "recordCurrentRecipeVersionMediaReferences", "RECIPE_MEDIA_VERSION_COVER_MISMATCH", "RECIPE_MEDIA_VERSION_STEP_MISMATCH"]) {
  assert.ok(versionReferences.includes(required), `Immutable version media protection is missing: ${required}`);
}
assert.match(cleanupScript, /protectVersionReferencedRecipeMedia/);
assert.match(publicRoutes, /coverThumbnailUrl/);
assert.match(publicRoutes, /hydrateMediaThumbnails/);

assert.match(recipePage, /AdminRecipeOperationsPanelV5/);
for (const required of ["createRecipeMediaDraft", "uploadRecipeMedia", "syncRecipeMedia", "coverMediaId", "thumbnailUrl"]) assert.ok(recipePanel.includes(required), `Recipe V5 media orchestration is missing: ${required}`);
assert.match(overview, /Resize tối đa 1920px/);
assert.match(overview, /coverThumbnailUrl/);
assert.match(steps, /thumbnailUrl \|\| step\.imageUrl/);
assert.match(pickers, /Media picker/);
assert.match(pickers, /thumbnailUrl \|\| item\.imageUrl/);
for (const required of ["createImageBitmap", "image/webp", "MAIN_MAX_DIMENSION = 1920", "THUMBNAIL_MAX_DIMENSION = 480", "upload-thumbnail", "verifyPublicImage", "/media/drafts", "/media/presign", "/complete", "/media/sync"]) assert.ok(mediaClient.includes(required), `Recipe media client is missing: ${required}`);

for (const required of ["CREATE TABLE IF NOT EXISTS recipe_media_drafts", "CREATE TABLE IF NOT EXISTS recipe_media", "CREATE TABLE IF NOT EXISTS recipe_media_version_refs", "REFERENCES recipe_media(id) ON DELETE RESTRICT", "cover_media_id", "media_id UUID", "thumbnail_object_key", "pending", "uploaded", "attached", "detached", "deleted"]) {
  assert.ok(migration.includes(required), `Media lifecycle migration is missing: ${required}`);
}

const parsedCors = JSON.parse(corsPolicy);
assert.ok(Array.isArray(parsedCors) && parsedCors.length > 0);
assert.ok(parsedCors[0].AllowedOrigins.includes("https://bepsi.click"));
assert.ok(parsedCors[0].AllowedMethods.includes("PUT"));
assert.ok(parsedCors[0].AllowedHeaders.includes("Content-Type"));

console.log("Admin Recipe V5 media lifecycle, thumbnails, and immutable version retention contract passed.");
