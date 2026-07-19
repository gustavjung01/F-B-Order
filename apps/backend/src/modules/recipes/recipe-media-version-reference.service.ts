import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { OrderEngineError } from "../orders/order-errors";

const VERSION_MEDIA_REFERENCE_SQL = `
  (
    EXISTS (
      SELECT 1
      FROM recipe_media_version_refs reference
      WHERE reference.media_id = media.id
    )
    OR EXISTS (
      SELECT 1
      FROM recipe_versions version
      WHERE version.snapshot ->> 'coverImageUrl' = media.public_url
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(version.snapshot -> 'steps', '[]'::jsonb)) step
           WHERE step ->> 'imageUrl' = media.public_url
         )
    )
  )
`;

type StepMediaReference = { stepNo: number; mediaId: string | null };

type VersionRow = {
  versionId: string;
  snapshot: Record<string, unknown>;
};

type MediaRow = {
  id: string;
  publicUrl: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function recordCurrentRecipeVersionMediaReferences(
  recipeId: string,
  coverMediaId: string | null,
  steps: StepMediaReference[],
  db: Pool = getDb(),
): Promise<{ versionId: string; mediaIds: string[] }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const versionResult = await client.query<VersionRow>(
      `SELECT version.id::text AS "versionId", version.snapshot
       FROM recipes recipe
       JOIN recipe_versions version ON version.id = recipe.current_version_id
       WHERE recipe.id = $1
       FOR SHARE OF recipe, version`,
      [recipeId],
    );
    const version = versionResult.rows[0];
    if (!version) {
      throw new OrderEngineError("RECIPE_VERSION_MISSING", 409, "Recipe does not have a current version for media references.");
    }

    const desiredIds = [coverMediaId, ...steps.map((step) => step.mediaId)]
      .filter((value): value is string => Boolean(value));
    const mediaResult = desiredIds.length > 0
      ? await client.query<MediaRow>(
          `SELECT id::text, public_url AS "publicUrl"
           FROM recipe_media
           WHERE id = ANY($1::uuid[])
             AND status = 'attached'`,
          [desiredIds],
        )
      : { rows: [] as MediaRow[] };
    if (mediaResult.rows.length !== desiredIds.length) {
      throw new OrderEngineError("RECIPE_MEDIA_VERSION_REFERENCE_INVALID", 409, "Every version media reference must point to attached media.");
    }

    const mediaById = new Map(mediaResult.rows.map((media) => [media.id, media]));
    const snapshot = record(version.snapshot);
    const snapshotSteps = Array.isArray(snapshot.steps) ? snapshot.steps.map(record) : [];
    const references: Array<{ mediaId: string; usage: "cover" | "step"; stepNo: number | null }> = [];

    if (coverMediaId) {
      const media = mediaById.get(coverMediaId)!;
      if (text(snapshot.coverImageUrl) !== media.publicUrl) {
        throw new OrderEngineError(
          "RECIPE_MEDIA_VERSION_COVER_MISMATCH",
          409,
          "Cover media does not match the immutable current version snapshot.",
        );
      }
      references.push({ mediaId: coverMediaId, usage: "cover", stepNo: null });
    }

    for (const step of steps) {
      if (!step.mediaId) continue;
      const media = mediaById.get(step.mediaId)!;
      const snapshotImageUrl = text(snapshotSteps[step.stepNo - 1]?.imageUrl);
      if (snapshotImageUrl !== media.publicUrl) {
        throw new OrderEngineError(
          "RECIPE_MEDIA_VERSION_STEP_MISMATCH",
          409,
          `Media for step ${step.stepNo} does not match the immutable current version snapshot.`,
        );
      }
      references.push({ mediaId: step.mediaId, usage: "step", stepNo: step.stepNo });
    }

    await client.query("DELETE FROM recipe_media_version_refs WHERE version_id = $1", [version.versionId]);
    for (const reference of references) {
      await client.query(
        `INSERT INTO recipe_media_version_refs (version_id, media_id, usage, step_no)
         VALUES ($1,$2,$3,$4)`,
        [version.versionId, reference.mediaId, reference.usage, reference.stepNo],
      );
    }
    await client.query("COMMIT");
    return { versionId: version.versionId, mediaIds: references.map((reference) => reference.mediaId) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

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
