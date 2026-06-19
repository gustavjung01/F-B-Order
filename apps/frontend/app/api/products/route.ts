import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ProductRow = {
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

function toStringArray(value: string[] | null) {
  return Array.isArray(value) ? value : [];
}

function normalizeBrandFilter(value: string) {
  return value.replace(/^brand-/i, "").replace(/-/g, " ").trim();
}

function parseLimit(value: string | null) {
  const parsed = Number(value || 60);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(1, Math.min(120, Math.trunc(parsed)));
}

async function isApprovedCustomer(userId?: string | null) {
  if (!userId) return false;
  const result = await db.query<{ approval_status: string }>(
    `SELECT approval_status FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.approval_status === "approved";
}

function mapProduct(row: ProductRow, approved: boolean) {
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
  };
}

export async function GET(request: Request) {
  const { userId } = await auth();
  const approved = await isApprovedCustomer(userId);
  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category")?.trim();
  const subcategory = searchParams.get("subcategory")?.trim();
  const brand = searchParams.get("brand")?.trim();
  const productType = searchParams.get("productType")?.trim();
  const search = (searchParams.get("q") || searchParams.get("search"))?.trim();
  const limit = parseLimit(searchParams.get("limit"));

  const values: Array<string | number> = [];
  const where = ["p.status = 'active'", "p.is_active = true"];

  if (category && category !== "all") {
    values.push(category);
    where.push(`(c.slug = $${values.length} OR sc.slug = $${values.length})`);
  }

  if (subcategory && subcategory !== "all") {
    values.push(subcategory);
    where.push(`sc.slug = $${values.length}`);
  }

  if (brand && brand !== "all" && brand !== "brand-distribution") {
    values.push(normalizeBrandFilter(brand));
    where.push(`p.brand ILIKE $${values.length}`);
  }

  if (productType) {
    values.push(productType);
    where.push(`p.product_type = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    const index = values.length;
    where.push(`(
      p.name ILIKE $${index}
      OR p.sku ILIKE $${index}
      OR p.brand ILIKE $${index}
      OR p.short_description ILIKE $${index}
      OR p.description ILIKE $${index}
    )`);
  }

  values.push(limit);

  const result = await db.query<ProductRow>(
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
    WHERE ${where.join(" AND ")}
    ORDER BY c.sort_order NULLS LAST, sc.sort_order NULLS LAST, p.sort_order, p.created_at DESC
    LIMIT $${values.length}`,
    values
  );

  return NextResponse.json({
    approved,
    filters: {
      category: category || null,
      subcategory: subcategory || null,
      brand: brand || null,
      productType: productType || null,
      search: search || null,
      limit,
    },
    products: result.rows.map((row) => mapProduct(row, approved)),
  });
}
