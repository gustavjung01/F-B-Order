import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const UPLOAD_EXPIRES_SECONDS = 300;
const DEFAULT_PUBLIC_BASE_URL = "https://cdn.bepsi.click";
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type UploadInput = {
  fileName?: unknown;
  contentType?: unknown;
  size?: unknown;
  purpose?: unknown;
  recipeId?: unknown;
};

type R2Config = {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
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
      {
        required: ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
      },
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

function createPresignedPutUrl(config: R2Config, objectKey: string, contentType: string): string {
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(config.bucketName)}/${encodeObjectPath(objectKey)}`;
  const { amzDate, dateStamp } = awsTimestamp(new Date());
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = "content-type;host";
  const query = canonicalQuery([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(UPLOAD_EXPIRES_SECONDS)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT",
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

export async function createRecipeImageUpload(identity: StaffIdentity, input: UploadInput) {
  requireAdmin(identity);
  const contentType = typeof input.contentType === "string" ? input.contentType.trim().toLowerCase() : "";
  const extension = IMAGE_TYPES.get(contentType);
  if (!extension) {
    throw new OrderEngineError("RECIPE_IMAGE_TYPE_INVALID", 400, "Only JPEG, PNG and WebP images are supported.");
  }

  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    throw new OrderEngineError("RECIPE_IMAGE_SIZE_INVALID", 400, "Image size must be between 1 byte and 8 MB.");
  }

  const purpose = input.purpose === "step" ? "steps" : input.purpose === "cover" ? "cover" : null;
  if (!purpose) {
    throw new OrderEngineError("RECIPE_IMAGE_PURPOSE_INVALID", 400, "purpose must be cover or step.");
  }

  const recipeId = typeof input.recipeId === "string" && input.recipeId.trim()
    ? input.recipeId.trim().toLowerCase()
    : null;
  if (recipeId && !UUID_PATTERN.test(recipeId)) {
    throw new OrderEngineError("INVALID_RECIPE_ID", 400, "recipeId must be a UUID.");
  }

  const config = readR2Config();
  const ownerPath = recipeId || "drafts";
  const objectKey = `recipes/${ownerPath}/${purpose}/${randomUUID()}.${extension}`;
  const uploadUrl = createPresignedPutUrl(config, objectKey, contentType);

  return {
    uploadUrl,
    publicUrl: publicObjectUrl(config, objectKey),
    objectKey,
    expiresIn: UPLOAD_EXPIRES_SECONDS,
    headers: { "Content-Type": contentType },
    maxBytes: MAX_IMAGE_BYTES,
  };
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
  const result = await db.query<{
    variantId: string;
    imageObjectKey: string | null;
  }>(
    `SELECT
       variant.id::text AS "variantId",
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
