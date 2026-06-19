import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ProductDetailRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  short_description: string | null;
  unit: string | null;
  package_spec: string | null;
  package_size: string | null;
  origin: string | null;
  image_url: string | null;
  base_price: string;
  wholesale_price: string | null;
  min_order_qty: number;
  status: string;
  product_type: string;
  industry_group: string | null;
  use_cases: string[] | null;
  tags: string[] | null;
  selling_points: string[] | null;
  source_confidence: string | null;
  category_name: string | null;
  category_slug: string | null;
  subcategory_name: string | null;
  subcategory_slug: string | null;
};

type ProductImageRow = {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type RelatedProductRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  wholesale_price: string | null;
  min_order_qty: number;
  category_name: string | null;
  category_slug: string | null;
};

function toStringArray(value: string[] | null) {
  return Array.isArray(value) ? value : [];
}

async function isApprovedCustomer(userId?: string | null) {
  if (!userId) return false;
  const result = await db.query<{ approval_status: string }>(
    `SELECT approval_status FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.approval_status === "approved";
}

function mapDetail(row: ProductDetailRow, approved: boolean, images: ProductImageRow[], relatedProducts: RelatedProductRow[]) {
  const wholesalePrice = row.wholesale_price ? Number(row.wholesale_price) : null;

  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand || "",
    description: row.description || "",
    shortDescription: row.short_description || "",
    unit: row.unit || "",
    packageSpec: row.package_spec || "",
    packageSize: row.package_size || row.package_spec || "",
    origin: row.origin || "",
    imageUrl: row.image_url || "",
    images: images.map((image) => ({
      id: image.id,
      imageUrl: image.image_url,
      altText: image.alt_text || row.name,
      sortOrder: image.sort_order,
      isPrimary: image.is_primary,
    })),
    minOrderQty: row.min_order_qty,
    status: row.status,
    productType: row.product_type,
    industryGroup: row.industry_group || "",
    useCases: toStringArray(row.use_cases),
    tags: toStringArray(row.tags),
    sellingPoints: toStringArray(row.selling_points),
    sourceConfidence: row.source_confidence || "",
    categoryName: row.category_name || "Khác",
    categorySlug: row.category_slug || "khac",
    subcategoryName: row.subcategory_name || "",
    subcategorySlug: row.subcategory_slug || "",
    price: approved && wholesalePrice !== null ? wholesalePrice : null,
    publicPriceHint: approved ? null : "Giá sỉ sau duyệt",
    relatedProducts: relatedProducts.map((product) => ({
      id: product.id,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      brand: product.brand || "",
      imageUrl: product.image_url || "",
      minOrderQty: product.min_order_qty,
      categoryName: product.category_name || "Khác",
      categorySlug: product.category_slug || "khac",
      price: approved && product.wholesale_price ? Number(product.wholesale_price) : null,
      publicPriceHint: approved ? null : "Giá sỉ sau duyệt",
    })),
  };
}

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const { userId } = await auth();
  const approved = await isApprovedCustomer(userId);
  const slug = decodeURIComponent(params.slug);

  const productResult = await db.query<ProductDetailRow>(
    `SELECT
      p.id,
      p.sku,
      p.slug,
      p.name,
      p.brand,
      p.description,
      p.short_description,
      p.unit,
      p.package_spec,
      p.package_size,
      p.origin,
      p.image_url,
      p.base_price::text,
      p.wholesale_price::text,
      p.min_order_qty,
      p.status,
      p.product_type,
      p.industry_group,
      p.use_cases,
      p.tags,
      p.selling_points,
      p.source_confidence,
      c.name AS category_name,
      c.slug AS category_slug,
      sc.name AS subcategory_name,
      sc.slug AS subcategory_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories sc ON sc.id = p.subcategory_id
    WHERE p.slug = $1
      AND p.status = 'active'
      AND p.is_active = true
    LIMIT 1`,
    [slug]
  );

  const product = productResult.rows[0];
  if (!product) {
    return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
  }

  const [imagesResult, relatedResult] = await Promise.all([
    db.query<ProductImageRow>(
      `SELECT id, image_url, alt_text, sort_order, is_primary
       FROM product_images
       WHERE product_id = $1
       ORDER BY is_primary DESC, sort_order, created_at`,
      [product.id]
    ),
    db.query<RelatedProductRow>(
      `SELECT
        p.id,
        p.sku,
        p.slug,
        p.name,
        p.brand,
        p.image_url,
        p.wholesale_price::text,
        p.min_order_qty,
        c.name AS category_name,
        c.slug AS category_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id <> $1
         AND p.status = 'active'
         AND p.is_active = true
         AND (
           p.category_id = $2
           OR p.subcategory_id = $3
           OR (p.brand IS NOT NULL AND $4::text IS NOT NULL AND p.brand = $4)
         )
       ORDER BY p.sort_order, p.created_at DESC
       LIMIT 8`,
      [product.id, product.category_slug ? productResult.rows[0].id : null, null, product.brand]
    ),
  ]);

  return NextResponse.json({
    approved,
    product: mapDetail(product, approved, imagesResult.rows, relatedResult.rows),
  });
}
