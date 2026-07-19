import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { OrderEngineError } from "../orders/order-errors";

const VERSION_MEDIA_REFERENCE_SQL = `
  EXISTS (
    SELECT 1
    FROM recipe_versions version
    WHERE version.snapshot ->> 'coverImageUrl' = media.public_url
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(version.snapshot -> 'steps', '[]'::jsonb)) step
         WHERE step ->> 'imageUrl' = media.public_url
       )
  )
`;

export async function assertRecipeMediaNotReferencedByVersion(
  mediaId: string,
  db: Pool = getDb(),
): Promise<void> {
  const result = await db.query<{ referenced: boolean }>(
    `SELECT ${VERSION_MEDIA_REFERENCE_SQL} AS referenced
     FROM recipe_media media
     WHERE media.id = $1`,
    [mediaId],
  );
  if (!result.rows[0]) {
    throw new OrderEngineError("RECIPE_MEDIA_NOT_FOUND", 404, "Recipe media was not found.");
  }
  if (result.rows[0].referenced) {
    throw new OrderEngineError(
      "RECIPE_MEDIA_VERSION_REFERENCE_EXISTS",
      409,
      "Media is retained by an immutable Recipe version and cannot be physically deleted.",
    );
  }
}

export async function protectVersionReferencedRecipeMedia(db: Pool = getDb()): Promise<number> {
  const result = await db.query(
    `UPDATE recipe_media media
     SET status = 'attached', detached_at = NULL, failure_reason = NULL, updated_at = NOW()
     WHERE media.status IN ('uploaded', 'detached', 'failed')
       AND ${VERSION_MEDIA_REFERENCE_SQL}`,
  );
  return result.rowCount || 0;
}
