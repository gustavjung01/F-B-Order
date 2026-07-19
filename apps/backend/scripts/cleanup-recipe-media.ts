import { getDb } from "../src/db/pool";
import { cleanupOrphanRecipeMedia } from "../src/modules/recipes/recipe-media.service";
import { protectVersionReferencedRecipeMedia } from "../src/modules/recipes/recipe-media-version-reference.service";

function readInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main(): Promise<void> {
  const db = getDb();

  try {
    const protectedVersionMedia = await protectVersionReferencedRecipeMedia(db);
    const result = await cleanupOrphanRecipeMedia({
      pendingHours: readInteger("RECIPE_MEDIA_PENDING_HOURS", 2),
      detachedDays: readInteger("RECIPE_MEDIA_DETACHED_DAYS", 7),
      limit: readInteger("RECIPE_MEDIA_CLEANUP_LIMIT", 100),
    }, db);

    console.log(JSON.stringify({ event: "recipe_media_cleanup", protectedVersionMedia, ...result }));
    if (result.failed.length > 0) process.exitCode = 1;
  } finally {
    await db.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ event: "recipe_media_cleanup_failed", message }));
  process.exitCode = 1;
});
