import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ImageInput = {
  imageUrl?: string;
  altText?: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

type ProductImagePatchBody = {
  productId?: string;
  slug?: string;
  imageUrl?: string;
  altText?: string;
  images?: Array<string | ImageInput>;
  replaceImages?: boolean;
};

type ProductImageListRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  status: string;
  image_url: string | null;
  image_count: string;
};

type ProductRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  image_url: string | null;
};

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (error) {
    return false;
  }
}

function normalizeSortOrder(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(0, Math.trunc(numberValue));
}

function normalizeImages(body: ProductImagePatchBody) {
  const fromImages = Array.isArray(body.images) ? body.images : [];
  const normalized = fromImages
    .map((item, index): ImageInput | null => {
      if (typeof item === "string") {
        return { imageUrl: item, sortOrder: index, isPrimary: index === 0 };
      }
      if (!item || typeof item !== "object") return null;
      return {
        imageUrl: item.imageUrl,
        altText: item.altText,
        sortOrder: normalizeSortOrder(item.sortOrder, index),
        isPrimary: Boolean(item.isPrimary),
      };
    })
    .filter((item): item is ImageInput => Boolean(item && isHttpUrl(item.imageUrl)));

  if (isHttpUrl(body.imageUrl)) {
    normalized.unshift({
      imageUrl: body.imageUrl,
      altText: body.altText,
      sortOrder: 0,
      isPrimary: true,
    });
  }

  const deduped = new Map<string, ImageInput>();
  normalized.forEach((item, index) => {
    if (!item.imageUrl) return;
    if (!deduped.has(item.imageUrl)) {
      deduped.set(item.imageUrl, {
        ...item,
        sortOrder: normalizeSortOrder(item.sortOrder, index),
      });
    }
  });

  const images = Array.from(deduped.values()).sort((left, right) => normalizeSortOrder(left.sortOrder, 0) - normalizeSortOrder(right.sortOrder, 0));
  return images.map((image, index) => ({
    ...image,
    sortOrder: normalizeSortOrder(image.sortOrder, index),
    isPrimary: index === 0 || Boolean(image.isPrimary && !images.slice(0, index).some((item) => item.isPrimary)),
  }));
}

function mapProduct(row: ProductImageListRow) {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand || "",
    status: row.status,
    imageUrl: row.image_url || "",
    imageCount: Number(row.image_count || 0),
  };
}

export async function GET(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim();
  const missingOnly = searchParams.get("missingOnly") === "true";

  const values: string[] = [];
  const where: string[] = [];

  if (status && status !== "all") {
    values.push(status);
    where.push(`p.status = $${values.length}`);
  }

  if (missingOnly) {
    where.push(`(p.image_url IS NULL OR p.image_url = '')`);
  }

  const result = await db.query<ProductImageListRow>(
    `SELECT
      p.id,
      p.sku,
      p.slug,
      p.name,
      p.brand,
      p.status,
      p.image_url,
      COUNT(pi.id)::text AS image_count
    FROM products p
    LEFT JOIN product_images pi ON pi.product_id = p.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY p.id, p.sku, p.slug, p.name, p.brand, p.status, p.image_url
    ORDER BY p.status, p.sort_order, p.created_at DESC
    LIMIT 500`,
    values
  );

  return NextResponse.json({ products: result.rows.map(mapProduct) });
}

export async function PATCH(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as ProductImagePatchBody;
  if (!body.productId && !body.slug) {
    return NextResponse.json({ error: "PRODUCT_IDENTIFIER_REQUIRED" }, { status: 400 });
  }

  const images = normalizeImages(body);
  if (images.length === 0) {
    return NextResponse.json({ error: "VALID_IMAGE_URL_REQUIRED" }, { status: 400 });
  }

  const productResult = await db.query<ProductRow>(
    `SELECT id, sku, slug, name, image_url
     FROM products
     WHERE ($1::uuid IS NOT NULL AND id = $1::uuid)
        OR ($2::text IS NOT NULL AND slug = $2::text)
     LIMIT 1`,
    [body.productId || null, body.slug || null]
  );

  const product = productResult.rows[0];
  if (!product) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  const primaryImage = images.find((image) => image.isPrimary) || images[0];

  try {
    await db.query("BEGIN");

    await db.query(
      `UPDATE products
       SET image_url = $2
       WHERE id = $1`,
      [product.id, primaryImage.imageUrl]
    );

    if (body.replaceImages !== false) {
      await db.query(`DELETE FROM product_images WHERE product_id = $1`, [product.id]);
    }

    for (const [index, image] of images.entries()) {
      await db.query(
        `INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          product.id,
          image.imageUrl,
          image.altText || body.altText || product.name,
          normalizeSortOrder(image.sortOrder, index),
          image.imageUrl === primaryImage.imageUrl,
        ]
      );
    }

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  return NextResponse.json({
    product: {
      id: product.id,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      imageUrl: primaryImage.imageUrl,
      imageCount: images.length,
    },
  });
}
