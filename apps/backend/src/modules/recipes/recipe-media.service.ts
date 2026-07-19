import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PROCESSED_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 700 * 1024;
const UPLOAD_EXPIRES_SECONDS = 300;
const DEFAULT_PUBLIC_BASE_URL = "https://cdn.bepsi.click";
const PROCESSED_CONTENT_TYPE = "image/webp";

type UploadInput = {
  draftId?: unknown;
  fileName?: unknown;
  sourceContentType?: unknown;
  sourceSize?: unknown;
  purpose?: unknown;
};

type CompleteInput = {
  byteSize?: unknown;
  thumbnailByteSize?: unknown;
  width?: unknown;
  height?: unknown;
};

type SyncInput = {
  recipeId?: unknown;
  coverMediaId?: unknown;
  steps?: unknown;
};

type R2Config = {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

type MediaRow = {
  id: string;
  draftId: string;
  recipeId: string | null;
  purpose: "cover" | "step";
  objectKey: string;
  thumbnailObjectKey: string;
  publicUrl: string;
  thumbnailUrl: string;
  status: string;
  createdByStaffId: string;
};

type CleanupOptions = {
  pendingHours?: number;
  detachedDays?: number;
  limit?: number;
};

function readRequiredEnv(names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function readR2Config(): R2Config {
  const accountId = readRequiredEnv(["R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID"]);
  const bucketName = readRequiredEnv(["R2_BUCKET_NAME", "CATALOG_R2_BUCKET", "R2_BUCKET"]);
  const accessKeyId = readRequiredEnv(["R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"]);
  const secretAccessKey = readRequiredEnv(["R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"]);
  const publicBaseUrl = (
    process.env.R2_PUBLIC_BASE_URL
    || process.env.CATALOG_ASSET_BASE_URL
    || DEFAULT_PUBLIC_BASE_URL
  ).trim().replace(/\/+$/, "");

  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
    throw new OrderEngineError(
      "R2_UPLOAD_NOT_CONFIGURED",
      503,
      "R2 image upload is not configured on the backend.",
      { required: ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] },
    );
  }

  return { accountId, bucketName, accessKeyId, secretAccessKey, publicBaseUrl };
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectPath(value: string): string {
  return value.split("/").map(encodeRfc3986).join("/");
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function canonicalQuery(entries: Array<[string, string]>): string {
  return entries
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function awsTimestamp(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function createPresignedObjectUrl(
  config: R2Config,
  method: "PUT" | "DELETE",
  objectKey: string,
  contentType?: string,
): string {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(config.bucketName)}/${encodeObjectPath(objectKey)}`;
  const { amzDate, dateStamp } = awsTimestamp(new Date());
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = contentType ? "content-type;host" : "host";
  const query = canonicalQuery([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(UPLOAD_EXPIRES_SECONDS)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]);
  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

function publicObjectUrl(config: R2Config, objectKey: string): string {
  return `${config.publicBaseUrl}/${objectKey.split("/").map(encodeRfc3986).join("/")}`;
}

function normalizeUuid(value: unknown, field: string, required = true): string | null {
  if (value === undefined || value === null || value === "") {
    if (!required) return null;
    throw new OrderEngineError(`RECIPE_MEDIA_${field.toUpperCase()}_REQUIRED`, 400, `${field} is required.`);
  }
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError(`RECIPE_MEDIA_${field.toUpperCase()}_INVALID`, 400, `${field} must be a UUID.`);
  }
  return normalized;
}

function normalizePositiveInteger(value: unknown, field: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new OrderEngineError(`RECIPE_MEDIA_${field.toUpperCase()}_INVALID`, 400, `${field} is invalid.`);
  }
  return parsed;
}

function normalizeVariantIds(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const ids = [...new Set(rawValues.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))];
  if (ids.length > 100 || ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new OrderEngineError("RECIPE_MEDIA_VARIANT_IDS_INVALID", 400, "variantIds must contain at most 100 UUID values.");
  }
  return ids;
}

async function loadMediaForUpdate(client: PoolClient, mediaId: string): Promise<MediaRow> {
  const result = await client.query<MediaRow>(
    `SELECT
       id::text,
       draft_id::text AS "draftId",
       recipe_id::text AS "recipeId",
       purpose,
       object_key AS "objectKey",
       thumbnail_object_key AS "thumbnailObjectKey",
       public_url AS "publicUrl",
       thumbnail_url AS "thumbnailUrl",
       status,
       created_by_staff_id::text AS "createdByStaffId"
     FROM recipe_media
     WHERE id = $1
     FOR UPDATE`,
    [mediaId],
  );
  const row = result.rows[0];
  if (!row) throw new OrderEngineError("RECIPE_MEDIA_NOT_FOUND", 404, "Recipe media was not found.");
  return row;
}

async function deleteR2Object(config: R2Config, objectKey: string): Promise<void> {
  const response = await fetch(createPresignedObjectUrl(config, "DELETE", objectKey), { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed for ${objectKey} (${response.status}).`);
  }
}

async function markDetachedIfUnreferenced(client: PoolClient, mediaIds: string[]): Promise<void> {
  if (mediaIds.length === 0) return;
  await client.query(
    `UPDATE recipe_media media
     SET status = 'detached', recipe_id = NULL, detached_at = NOW(), updated_at = NOW()
     WHERE media.id = ANY($1::uuid[])
       AND media.status <> 'deleted'
       AND NOT EXISTS (SELECT 1 FROM recipes recipe WHERE recipe.cover_media_id = media.id)
       AND NOT EXISTS (SELECT 1 FROM recipe_steps step WHERE step.media_id = media.id)`,
    [mediaIds],
  );
}

export async function createRecipeMediaDraft(
  identity: StaffIdentity,
  input: { recipeId?: unknown } = {},
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const recipeId = normalizeUuid(input.recipeId, "recipe_id", false);
  if (recipeId) {
    const recipe = await db.query("SELECT id FROM recipes WHERE id = $1", [recipeId]);
    if (!recipe.rows[0]) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
  }
  const result = await db.query<{ id: string; expiresAt: string }>(
    `INSERT INTO recipe_media_drafts (recipe_id, created_by_staff_id)
     VALUES ($1, $2)
     RETURNING id::text, expires_at::text AS "expiresAt"`,
    [recipeId, identity.staffId],
  );
  return { draftId: result.rows[0].id, expiresAt: result.rows[0].expiresAt };
}

export async function createRecipeImageUpload(
  identity: StaffIdentity,
  input: UploadInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const sourceContentType = typeof input.sourceContentType === "string"
    ? input.sourceContentType.trim().toLowerCase()
    : "";
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(sourceContentType)) {
    throw new OrderEngineError("RECIPE_IMAGE_TYPE_INVALID", 400, "Only JPEG, PNG and WebP source images are supported.");
  }
  normalizePositiveInteger(input.sourceSize, "source_size", MAX_SOURCE_IMAGE_BYTES);
  const purpose = input.purpose === "cover" ? "cover" : input.purpose === "step" ? "step" : null;
  if (!purpose) throw new OrderEngineError("RECIPE_IMAGE_PURPOSE_INVALID", 400, "purpose must be cover or step.");
  const draftId = normalizeUuid(input.draftId, "draft_id")!;
  const fileName = typeof input.fileName === "string" ? input.fileName.trim().slice(0, 240) : null;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const draft = await client.query<{ id: string }>(
      `SELECT id::text
       FROM recipe_media_drafts
       WHERE id = $1 AND created_by_staff_id = $2 AND status = 'open' AND expires_at > NOW()
       FOR UPDATE`,
      [draftId, identity.staffId],
    );
    if (!draft.rows[0]) {
      throw new OrderEngineError("RECIPE_MEDIA_DRAFT_INVALID", 409, "Media draft is missing, expired, or owned by another admin.");
    }

    const mediaId = randomUUID();
    const baseKey = `recipes/drafts/${draftId}/${purpose}/${mediaId}`;
    const objectKey = `${baseKey}/image.webp`;
    const thumbnailObjectKey = `${baseKey}/thumbnail.webp`;
    const config = readR2Config();
    await client.query(
      `INSERT INTO recipe_media (
         id, draft_id, purpose, object_key, thumbnail_object_key,
         public_url, thumbnail_url, original_file_name, content_type, created_by_staff_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        mediaId,
        draftId,
        purpose,
        objectKey,
        thumbnailObjectKey,
        publicObjectUrl(config, objectKey),
        publicObjectUrl(config, thumbnailObjectKey),
        fileName,
        PROCESSED_CONTENT_TYPE,
        identity.staffId,
      ],
    );
    await client.query("COMMIT");

    const headers = { "Content-Type": PROCESSED_CONTENT_TYPE };
    return {
      mediaId,
      draftId,
      contentType: PROCESSED_CONTENT_TYPE,
      uploadUrl: createPresignedObjectUrl(config, "PUT", objectKey, PROCESSED_CONTENT_TYPE),
      publicUrl: publicObjectUrl(config, objectKey),
      objectKey,
      headers,
      thumbnail: {
        uploadUrl: createPresignedObjectUrl(config, "PUT", thumbnailObjectKey, PROCESSED_CONTENT_TYPE),
        publicUrl: publicObjectUrl(config, thumbnailObjectKey),
        objectKey: thumbnailObjectKey,
        headers,
      },
      expiresIn: UPLOAD_EXPIRES_SECONDS,
      maxBytes: MAX_PROCESSED_IMAGE_BYTES,
      maxThumbnailBytes: MAX_THUMBNAIL_BYTES,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeRecipeMediaUpload(
  identity: StaffIdentity,
  mediaIdValue: unknown,
  input: CompleteInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const mediaId = normalizeUuid(mediaIdValue, "media_id")!;
  const byteSize = normalizePositiveInteger(input.byteSize, "byte_size", MAX_PROCESSED_IMAGE_BYTES);
  const thumbnailByteSize = normalizePositiveInteger(input.thumbnailByteSize, "thumbnail_byte_size", MAX_THUMBNAIL_BYTES);
  const width = normalizePositiveInteger(input.width, "width", 12000);
  const height = normalizePositiveInteger(input.height, "height", 12000);
  const result = await db.query<MediaRow>(
    `UPDATE recipe_media
     SET status = 'uploaded', byte_size = $2, thumbnail_byte_size = $3,
         width = $4, height = $5, uploaded_at = NOW(), last_verified_at = NOW(),
         failure_reason = NULL, updated_at = NOW()
     WHERE id = $1 AND created_by_staff_id = $6 AND status IN ('pending', 'failed')
     RETURNING id::text, draft_id::text AS "draftId", recipe_id::text AS "recipeId",
       purpose, object_key AS "objectKey", thumbnail_object_key AS "thumbnailObjectKey",
       public_url AS "publicUrl", thumbnail_url AS "thumbnailUrl", status,
       created_by_staff_id::text AS "createdByStaffId"`,
    [mediaId, byteSize, thumbnailByteSize, width, height, identity.staffId],
  );
  if (!result.rows[0]) {
    throw new OrderEngineError("RECIPE_MEDIA_COMPLETE_CONFLICT", 409, "Media upload cannot be completed from its current state.");
  }
  return { media: result.rows[0] };
}

export async function getRecipeMediaReferences(
  identity: StaffIdentity,
  recipeIdValue: unknown,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const recipeId = normalizeUuid(recipeIdValue, "recipe_id")!;
  const [cover, steps] = await Promise.all([
    db.query(
      `SELECT media.id::text AS "mediaId", media.public_url AS "publicUrl",
         media.thumbnail_url AS "thumbnailUrl", media.status
       FROM recipes recipe
       LEFT JOIN recipe_media media ON media.id = recipe.cover_media_id
       WHERE recipe.id = $1`,
      [recipeId],
    ),
    db.query(
      `SELECT step.step_no AS "stepNo", media.id::text AS "mediaId",
         media.public_url AS "publicUrl", media.thumbnail_url AS "thumbnailUrl", media.status
       FROM recipe_steps step
       LEFT JOIN recipe_media media ON media.id = step.media_id
       WHERE step.recipe_id = $1
       ORDER BY step.step_no`,
      [recipeId],
    ),
  ]);
  if (!cover.rows[0]) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
  return { cover: cover.rows[0].mediaId ? cover.rows[0] : null, steps: steps.rows };
}

export async function syncRecipeMedia(
  identity: StaffIdentity,
  input: SyncInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const recipeId = normalizeUuid(input.recipeId, "recipe_id")!;
  const coverMediaId = normalizeUuid(input.coverMediaId, "cover_media_id", false);
  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  if (rawSteps.length > 100) throw new OrderEngineError("RECIPE_MEDIA_STEPS_INVALID", 400, "At most 100 step media references are allowed.");
  const steps = rawSteps.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new OrderEngineError("RECIPE_MEDIA_STEP_INVALID", 400, `Step media ${index + 1} is invalid.`);
    }
    const row = entry as { stepNo?: unknown; mediaId?: unknown };
    return {
      stepNo: normalizePositiveInteger(row.stepNo, "step_no", 100),
      mediaId: normalizeUuid(row.mediaId, "step_media_id", false),
    };
  });
  const desiredIds = [coverMediaId, ...steps.map((step) => step.mediaId)].filter((value): value is string => Boolean(value));
  if (new Set(desiredIds).size !== desiredIds.length) {
    throw new OrderEngineError("RECIPE_MEDIA_DUPLICATE", 400, "One media item cannot be attached to multiple recipe targets.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const recipe = await client.query<{ coverMediaId: string | null }>(
      `SELECT cover_media_id::text AS "coverMediaId" FROM recipes WHERE id = $1 FOR UPDATE`,
      [recipeId],
    );
    if (!recipe.rows[0]) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
    const stepRows = await client.query<{ stepNo: number; mediaId: string | null }>(
      `SELECT step_no AS "stepNo", media_id::text AS "mediaId"
       FROM recipe_steps WHERE recipe_id = $1 ORDER BY step_no FOR UPDATE`,
      [recipeId],
    );
    const availableStepNos = new Set(stepRows.rows.map((row) => row.stepNo));
    const missingStep = steps.find((step) => !availableStepNos.has(step.stepNo));
    if (missingStep) throw new OrderEngineError("RECIPE_MEDIA_STEP_NOT_FOUND", 404, `Recipe step ${missingStep.stepNo} was not found.`);

    const mediaRows = desiredIds.length
      ? await client.query<MediaRow>(
          `SELECT id::text, draft_id::text AS "draftId", recipe_id::text AS "recipeId",
             purpose, object_key AS "objectKey", thumbnail_object_key AS "thumbnailObjectKey",
             public_url AS "publicUrl", thumbnail_url AS "thumbnailUrl", status,
             created_by_staff_id::text AS "createdByStaffId"
           FROM recipe_media WHERE id = ANY($1::uuid[]) FOR UPDATE`,
          [desiredIds],
        )
      : { rows: [] as MediaRow[] };
    if (mediaRows.rows.length !== desiredIds.length) {
      throw new OrderEngineError("RECIPE_MEDIA_NOT_FOUND", 404, "One or more media items were not found.");
    }
    const byId = new Map(mediaRows.rows.map((row) => [row.id, row]));
    for (const mediaId of desiredIds) {
      const media = byId.get(mediaId)!;
      if (!new Set(["uploaded", "attached"]).has(media.status)) {
        throw new OrderEngineError("RECIPE_MEDIA_NOT_READY", 409, "Every attached media item must have a completed upload.");
      }
    }
    if (coverMediaId && byId.get(coverMediaId)?.purpose !== "cover") {
      throw new OrderEngineError("RECIPE_MEDIA_PURPOSE_MISMATCH", 400, "Cover media must have cover purpose.");
    }
    for (const step of steps) {
      if (step.mediaId && byId.get(step.mediaId)?.purpose !== "step") {
        throw new OrderEngineError("RECIPE_MEDIA_PURPOSE_MISMATCH", 400, `Media for step ${step.stepNo} must have step purpose.`);
      }
    }

    if (coverMediaId) {
      const media = byId.get(coverMediaId)!;
      await client.query(
        `UPDATE recipes SET cover_media_id = $2, cover_image_url = $3, updated_at = NOW() WHERE id = $1`,
        [recipeId, coverMediaId, media.publicUrl],
      );
    } else {
      await client.query("UPDATE recipes SET cover_media_id = NULL, updated_at = NOW() WHERE id = $1", [recipeId]);
    }

    const desiredStepMap = new Map(steps.map((step) => [step.stepNo, step.mediaId]));
    for (const stepRow of stepRows.rows) {
      const mediaId = desiredStepMap.get(stepRow.stepNo) ?? null;
      if (mediaId) {
        await client.query(
          `UPDATE recipe_steps SET media_id = $3, image_url = $4 WHERE recipe_id = $1 AND step_no = $2`,
          [recipeId, stepRow.stepNo, mediaId, byId.get(mediaId)!.publicUrl],
        );
      } else {
        await client.query(
          `UPDATE recipe_steps SET media_id = NULL WHERE recipe_id = $1 AND step_no = $2`,
          [recipeId, stepRow.stepNo],
        );
      }
    }

    if (desiredIds.length > 0) {
      await client.query(
        `UPDATE recipe_media
         SET recipe_id = $2, status = 'attached', attached_at = NOW(), detached_at = NULL, updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [desiredIds, recipeId],
      );
      await client.query(
        `UPDATE recipe_media_drafts draft
         SET recipe_id = $2, status = 'attached', attached_at = NOW(), updated_at = NOW()
         WHERE draft.id IN (SELECT DISTINCT draft_id FROM recipe_media WHERE id = ANY($1::uuid[]))`,
        [desiredIds, recipeId],
      );
    }

    const previousIds = [recipe.rows[0].coverMediaId, ...stepRows.rows.map((row) => row.mediaId)]
      .filter((value): value is string => Boolean(value));
    await markDetachedIfUnreferenced(client, previousIds.filter((id) => !desiredIds.includes(id)));
    await client.query("COMMIT");
    return { recipeId, coverMediaId, steps, attachedMediaIds: desiredIds };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function detachRecipeMedia(
  identity: StaffIdentity,
  mediaIdValue: unknown,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const mediaId = normalizeUuid(mediaIdValue, "media_id")!;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const media = await loadMediaForUpdate(client, mediaId);
    if (media.status === "deleted") throw new OrderEngineError("RECIPE_MEDIA_DELETED", 409, "Deleted media cannot be detached.");
    await client.query("UPDATE recipes SET cover_media_id = NULL WHERE cover_media_id = $1", [mediaId]);
    await client.query("UPDATE recipe_steps SET media_id = NULL WHERE media_id = $1", [mediaId]);
    await markDetachedIfUnreferenced(client, [mediaId]);
    await client.query("COMMIT");
    return { mediaId, status: "detached" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMediaRecord(client: PoolClient, media: MediaRow, config: R2Config): Promise<void> {
  const references = await client.query<{ count: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM recipes WHERE cover_media_id = $1)
       + (SELECT COUNT(*) FROM recipe_steps WHERE media_id = $1)
     )::int AS count`,
    [media.id],
  );
  if ((references.rows[0]?.count ?? 0) > 0 || media.status === "attached") {
    throw new OrderEngineError("RECIPE_MEDIA_STILL_ATTACHED", 409, "Detach media before deleting it.");
  }
  await deleteR2Object(config, media.objectKey);
  await deleteR2Object(config, media.thumbnailObjectKey);
  await client.query(
    `UPDATE recipe_media
     SET status = 'deleted', deleted_at = NOW(), failure_reason = NULL, updated_at = NOW()
     WHERE id = $1`,
    [media.id],
  );
}

export async function deleteRecipeMedia(
  identity: StaffIdentity,
  mediaIdValue: unknown,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const mediaId = normalizeUuid(mediaIdValue, "media_id")!;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const media = await loadMediaForUpdate(client, mediaId);
    if (media.status !== "deleted") await deleteMediaRecord(client, media, readR2Config());
    await client.query("COMMIT");
    return { mediaId, status: "deleted" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupOrphanRecipeMedia(
  options: CleanupOptions = {},
  db: Pool = getDb(),
) {
  const pendingHours = Math.min(Math.max(options.pendingHours ?? 2, 1), 168);
  const detachedDays = Math.min(Math.max(options.detachedDays ?? 7, 1), 90);
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const candidates = await db.query<MediaRow>(
    `SELECT id::text, draft_id::text AS "draftId", recipe_id::text AS "recipeId",
       purpose, object_key AS "objectKey", thumbnail_object_key AS "thumbnailObjectKey",
       public_url AS "publicUrl", thumbnail_url AS "thumbnailUrl", status,
       created_by_staff_id::text AS "createdByStaffId"
     FROM recipe_media media
     WHERE media.status <> 'deleted'
       AND NOT EXISTS (SELECT 1 FROM recipes recipe WHERE recipe.cover_media_id = media.id)
       AND NOT EXISTS (SELECT 1 FROM recipe_steps step WHERE step.media_id = media.id)
       AND (
         (media.status IN ('pending', 'failed') AND media.created_at < NOW() - ($1::text || ' hours')::interval)
         OR (media.status IN ('uploaded', 'detached') AND COALESCE(media.detached_at, media.uploaded_at, media.created_at) < NOW() - ($2::text || ' days')::interval)
       )
     ORDER BY media.created_at
     LIMIT $3`,
    [pendingHours, detachedDays, limit],
  );
  const config = readR2Config();
  const deleted: string[] = [];
  const failed: Array<{ mediaId: string; message: string }> = [];
  for (const candidate of candidates.rows) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const locked = await loadMediaForUpdate(client, candidate.id);
      await deleteMediaRecord(client, locked, config);
      await client.query("COMMIT");
      deleted.push(candidate.id);
    } catch (error) {
      await client.query("ROLLBACK");
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ mediaId: candidate.id, message });
      await db.query(
        `UPDATE recipe_media SET status = 'failed', failure_reason = $2, updated_at = NOW()
         WHERE id = $1 AND status <> 'attached'`,
        [candidate.id, message.slice(0, 1000)],
      );
    } finally {
      client.release();
    }
  }
  await db.query(
    `UPDATE recipe_media_drafts draft
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'open' AND expires_at < NOW()
       AND NOT EXISTS (
         SELECT 1 FROM recipe_media media
         WHERE media.draft_id = draft.id AND media.status NOT IN ('deleted', 'failed')
       )`,
  );
  return { scanned: candidates.rows.length, deleted, failed, pendingHours, detachedDays };
}

export async function getRecipeCatalogMedia(
  identity: StaffIdentity,
  input: { variantIds?: unknown },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const variantIds = normalizeVariantIds(input.variantIds);
  if (variantIds.length === 0) return { items: [] };
  const config = readR2Config();
  const result = await db.query<{ variantId: string; imageObjectKey: string | null }>(
    `SELECT variant.id::text AS "variantId",
       COALESCE(variant.image_object_key, product.cover_image_object_key) AS "imageObjectKey"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     WHERE variant.id = ANY($1::uuid[])
       AND product.catalog_version = 'hung-phat-v2'
       AND variant.catalog_version = 'hung-phat-v2'`,
    [variantIds],
  );
  return {
    items: result.rows.map(({ imageObjectKey, ...row }) => ({
      ...row,
      imageUrl: imageObjectKey ? publicObjectUrl(config, imageObjectKey) : null,
    })),
  };
}
