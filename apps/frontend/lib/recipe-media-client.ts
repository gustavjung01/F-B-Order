import { adminApiFetch } from "@/lib/admin-api";

const SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAIN_MAX_DIMENSION = 1920;
const THUMBNAIL_MAX_DIMENSION = 480;
const MAIN_MAX_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_MAX_BYTES = 700 * 1024;

type UploadPhase = "processing" | "presign" | "upload-main" | "upload-thumbnail" | "verify" | "complete";

type ProcessedImage = {
  main: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
};

type PresignResponse = {
  mediaId: string;
  draftId: string;
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  headers: Record<string, string>;
  maxBytes: number;
  maxThumbnailBytes: number;
  thumbnail: {
    uploadUrl: string;
    publicUrl: string;
    objectKey: string;
    headers: Record<string, string>;
  };
};

export type UploadedRecipeMedia = {
  mediaId: string;
  draftId: string;
  publicUrl: string;
  thumbnailUrl: string;
  objectKey: string;
  thumbnailObjectKey: string;
  width: number;
  height: number;
  byteSize: number;
  thumbnailByteSize: number;
};

function scaledSize(width: number, height: number, maximum: number) {
  const ratio = Math.min(1, maximum / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Trình duyệt không thể mã hóa ảnh WebP."));
    }, "image/webp", quality);
  });
}

async function drawWebp(
  bitmap: ImageBitmap,
  maximumDimension: number,
  maximumBytes: number,
  initialQuality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const size = scaledSize(bitmap.width, bitmap.height, maximumDimension);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh bằng canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);

  let quality = initialQuality;
  let blob = await canvasBlob(canvas, quality);
  while (blob.size > maximumBytes && quality > 0.5) {
    quality -= 0.08;
    blob = await canvasBlob(canvas, quality);
  }
  if (blob.size > maximumBytes) {
    throw new Error(`Ảnh sau nén vẫn vượt ${Math.round(maximumBytes / 1024 / 1024)} MB. Hãy chọn ảnh nhỏ hơn.`);
  }
  return { blob, width: size.width, height: size.height };
}

export async function prepareRecipeImage(file: File): Promise<ProcessedImage> {
  if (!SOURCE_TYPES.has(file.type)) throw new Error("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error("Ảnh nguồn phải nhỏ hơn hoặc bằng 12 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [main, thumbnail] = await Promise.all([
      drawWebp(bitmap, MAIN_MAX_DIMENSION, MAIN_MAX_BYTES, 0.86),
      drawWebp(bitmap, THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_BYTES, 0.78),
    ]);
    return {
      main: main.blob,
      thumbnail: thumbnail.blob,
      width: main.width,
      height: main.height,
    };
  } finally {
    bitmap.close();
  }
}

function verifyPublicImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error("CDN chưa đọc được ảnh sau 15 giây.")), 15000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("URL public của ảnh không tải được. Kiểm tra CDN/R2 public access."));
    };
    image.src = `${url}${url.includes("?") ? "&" : "?"}verify=${Date.now()}`;
  });
}

export async function createRecipeMediaDraft(token: string, recipeId?: string | null) {
  return adminApiFetch<{ draftId: string; expiresAt: string }>("/api/admin/recipes/media/drafts", token, {
    method: "POST",
    body: JSON.stringify({ recipeId: recipeId || undefined }),
  });
}

export async function uploadRecipeMedia(input: {
  token: string;
  draftId: string;
  purpose: "cover" | "step";
  file: File;
  onPhase?: (phase: UploadPhase) => void;
}): Promise<UploadedRecipeMedia> {
  input.onPhase?.("processing");
  const processed = await prepareRecipeImage(input.file);

  input.onPhase?.("presign");
  const signed = await adminApiFetch<PresignResponse>("/api/admin/recipes/media/presign", input.token, {
    method: "POST",
    body: JSON.stringify({
      draftId: input.draftId,
      fileName: input.file.name,
      sourceContentType: input.file.type,
      sourceSize: input.file.size,
      purpose: input.purpose,
    }),
  });
  if (processed.main.size > signed.maxBytes || processed.thumbnail.size > signed.maxThumbnailBytes) {
    throw new Error("Ảnh sau xử lý vượt giới hạn backend cho phép.");
  }

  input.onPhase?.("upload-main");
  const mainResponse = await fetch(signed.uploadUrl, {
    method: "PUT",
    body: processed.main,
    headers: signed.headers,
  });
  if (!mainResponse.ok) throw new Error(`Upload ảnh chính thất bại (${mainResponse.status}).`);

  input.onPhase?.("upload-thumbnail");
  const thumbnailResponse = await fetch(signed.thumbnail.uploadUrl, {
    method: "PUT",
    body: processed.thumbnail,
    headers: signed.thumbnail.headers,
  });
  if (!thumbnailResponse.ok) throw new Error(`Upload thumbnail thất bại (${thumbnailResponse.status}).`);

  input.onPhase?.("verify");
  await Promise.all([verifyPublicImage(signed.publicUrl), verifyPublicImage(signed.thumbnail.publicUrl)]);

  input.onPhase?.("complete");
  await adminApiFetch(`/api/admin/recipes/media/${signed.mediaId}/complete`, input.token, {
    method: "POST",
    body: JSON.stringify({
      byteSize: processed.main.size,
      thumbnailByteSize: processed.thumbnail.size,
      width: processed.width,
      height: processed.height,
    }),
  });

  return {
    mediaId: signed.mediaId,
    draftId: signed.draftId,
    publicUrl: signed.publicUrl,
    thumbnailUrl: signed.thumbnail.publicUrl,
    objectKey: signed.objectKey,
    thumbnailObjectKey: signed.thumbnail.objectKey,
    width: processed.width,
    height: processed.height,
    byteSize: processed.main.size,
    thumbnailByteSize: processed.thumbnail.size,
  };
}

export async function syncRecipeMedia(input: {
  token: string;
  recipeId: string;
  coverMediaId: string | null;
  steps: Array<{ stepNo: number; mediaId: string | null }>;
}) {
  return adminApiFetch("/api/admin/recipes/media/sync", input.token, {
    method: "POST",
    body: JSON.stringify({
      recipeId: input.recipeId,
      coverMediaId: input.coverMediaId,
      steps: input.steps,
    }),
  });
}

export async function loadRecipeMediaReferences(token: string, recipeId: string) {
  return adminApiFetch<{
    cover: { mediaId: string; publicUrl: string; thumbnailUrl: string; status: string } | null;
    steps: Array<{ stepNo: number; mediaId: string | null; publicUrl: string | null; thumbnailUrl: string | null; status: string | null }>;
  }>(`/api/admin/recipes/media/recipe/${recipeId}`, token);
}

export async function detachRecipeMedia(token: string, mediaId: string) {
  return adminApiFetch(`/api/admin/recipes/media/${mediaId}/detach`, token, { method: "POST" });
}

export async function deleteRecipeMedia(token: string, mediaId: string) {
  return adminApiFetch(`/api/admin/recipes/media/${mediaId}`, token, { method: "DELETE" });
}
