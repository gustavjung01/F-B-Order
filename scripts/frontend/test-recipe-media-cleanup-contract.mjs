import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("apps/backend/package.json", "utf8"));
const cleanupScript = await readFile("apps/backend/scripts/cleanup-recipe-media.ts", "utf8");
const cleanupService = await readFile("infra/systemd/bepsi-recipe-media-cleanup.service", "utf8");
const cleanupTimer = await readFile("infra/systemd/bepsi-recipe-media-cleanup.timer", "utf8");

assert.equal(packageJson.scripts["recipe-media:cleanup"], "tsx scripts/cleanup-recipe-media.ts");
for (const required of [
  "protectVersionReferencedRecipeMedia",
  "cleanupOrphanRecipeMedia",
  "RECIPE_MEDIA_PENDING_HOURS",
  "RECIPE_MEDIA_DETACHED_DAYS",
  "RECIPE_MEDIA_CLEANUP_LIMIT",
  "protectedVersionMedia",
]) {
  assert.ok(cleanupScript.includes(required), `Cleanup script is missing: ${required}`);
}

assert.match(cleanupService, /WorkingDirectory=\/srv\/apps\/bepsi\/current\/apps\/backend/);
assert.doesNotMatch(cleanupService, /WorkingDirectory=\/srv\/apps\/bepsi\/apps\/backend/);
assert.match(cleanupService, /corepack pnpm recipe-media:cleanup/);
assert.match(cleanupService, /Type=oneshot/);
assert.match(cleanupTimer, /OnCalendar=\*-\*-\* 03:20:00 Asia\/Ho_Chi_Minh/);
assert.match(cleanupTimer, /Persistent=true/);
assert.match(cleanupTimer, /RandomizedDelaySec=900/);

console.log("Recipe media orphan cleanup scheduling contract passed.");
