import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backendService = await readFile("apps/backend/src/modules/recipes/recipe-media.service.ts", "utf8");
const backendRoutes = await readFile("apps/backend/src/modules/recipes/recipe-admin.routes.ts", "utf8");
const recipePage = await readFile("apps/frontend/app/admin/recipes/page.tsx", "utf8");
const recipePanel = await readFile("apps/frontend/components/admin/AdminRecipeOperationsPanelV2.tsx", "utf8");
const corsPolicy = await readFile("infra/cloudflare/r2-recipe-media-cors.json", "utf8");

assert.match(backendService, /R2_ACCOUNT_ID/);
assert.match(backendService, /R2_BUCKET_NAME/);
assert.match(backendService, /R2_ACCESS_KEY_ID/);
assert.match(backendService, /R2_SECRET_ACCESS_KEY/);
assert.match(backendService, /UPLOAD_EXPIRES_SECONDS = 300/);
assert.match(backendService, /MAX_IMAGE_BYTES = 8 \* 1024 \* 1024/);
assert.match(backendService, /image\/jpeg/);
assert.match(backendService, /image\/png/);
assert.match(backendService, /image\/webp/);
assert.match(backendService, /`recipes\/\$\{ownerPath\}\/\$\{purpose\}\/\$\{randomUUID\(\)\}/);
assert.match(backendService, /AWS4-HMAC-SHA256/);
assert.match(backendService, /UNSIGNED-PAYLOAD/);
assert.match(backendService, /content-type;host/);
assert.match(backendService, /getRecipeCatalogMedia/);

const mediaCatalogIndex = backendRoutes.indexOf('router.get("/media/catalog"');
const mediaPresignIndex = backendRoutes.indexOf('router.post("/media/presign"');
const dynamicRecipeIndex = backendRoutes.indexOf('router.get("/:recipeId"');
assert.ok(mediaCatalogIndex >= 0 && mediaCatalogIndex < dynamicRecipeIndex, "Media catalog route must stay above /:recipeId.");
assert.ok(mediaPresignIndex >= 0 && mediaPresignIndex < dynamicRecipeIndex, "Media presign route must stay above /:recipeId.");

assert.match(recipePage, /AdminRecipeOperationsPanelV2/);
assert.match(recipePanel, /Tải ảnh từ máy/);
assert.match(recipePanel, /Tải ảnh bước từ máy/);
assert.match(recipePanel, /Dùng làm ảnh bìa/);
assert.match(recipePanel, /Đang dùng làm ảnh bìa/);
assert.match(recipePanel, /Sản phẩm chưa có ảnh/);
assert.match(recipePanel, /\/api\/admin\/recipes\/media\/presign/);
assert.match(recipePanel, /\/api\/admin\/recipes\/media\/catalog/);
assert.match(recipePanel, /method: "PUT"/);
assert.match(recipePanel, /headers: signed\.headers/);
assert.match(recipePanel, /file\.size > MAX_IMAGE_BYTES/);
assert.match(recipePanel, /R2 từ chối upload/);

const parsedCors = JSON.parse(corsPolicy);
assert.ok(Array.isArray(parsedCors) && parsedCors.length > 0);
assert.ok(parsedCors[0].AllowedOrigins.includes("https://bepsi.click"));
assert.ok(parsedCors[0].AllowedMethods.includes("PUT"));
assert.ok(parsedCors[0].AllowedHeaders.includes("Content-Type"));

console.log("Admin Recipe R2 media upload contract passed.");
