import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RecipeRow = {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  description: string | null;
  related_brand: string | null;
  cover_image_url: string | null;
  source_confidence: string;
  status: string;
  category_name: string | null;
  category_slug: string | null;
  ingredient_count: string;
  mapped_product_count: string;
};

async function isApprovedCustomer(userId?: string | null) {
  if (!userId) return false;
  const result = await db.query<{ approval_status: string }>(
    `SELECT approval_status FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.approval_status === "approved";
}

function parseLimit(value: string | null) {
  const parsed = Number(value || 60);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(1, Math.min(120, Math.trunc(parsed)));
}

function mapRecipe(row: RecipeRow, approved: boolean) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description || "",
    description: row.description || "",
    relatedBrand: row.related_brand || "",
    coverImageUrl: row.cover_image_url || "",
    sourceConfidence: row.source_confidence,
    status: row.status,
    categoryName: row.category_name || "Công thức",
    categorySlug: row.category_slug || "combo-cong-thuc",
    ingredientCount: Number(row.ingredient_count || 0),
    mappedProductCount: Number(row.mapped_product_count || 0),
    isLocked: !approved,
    lockReason: approved ? null : "Đăng nhập và được duyệt hồ sơ quán để xem định lượng chi tiết.",
  };
}

export async function GET(request: Request) {
  const { userId } = await auth();
  const approved = await isApprovedCustomer(userId);
  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category")?.trim();
  const brand = searchParams.get("brand")?.trim();
  const search = (searchParams.get("q") || searchParams.get("search"))?.trim();
  const limit = parseLimit(searchParams.get("limit"));

  const values: Array<string | number> = [];
  const where = ["r.status = 'active'"];

  if (category && category !== "all") {
    values.push(category);
    where.push(`c.slug = $${values.length}`);
  }

  if (brand && brand !== "all") {
    values.push(brand);
    where.push(`r.related_brand ILIKE $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    const index = values.length;
    where.push(`(
      r.title ILIKE $${index}
      OR r.short_description ILIKE $${index}
      OR r.description ILIKE $${index}
      OR r.related_brand ILIKE $${index}
    )`);
  }

  values.push(limit);

  const result = await db.query<RecipeRow>(
    `SELECT
      r.id,
      r.slug,
      r.title,
      r.short_description,
      r.description,
      r.related_brand,
      r.cover_image_url,
      r.source_confidence,
      r.status,
      c.name AS category_name,
      c.slug AS category_slug,
      COUNT(ri.id)::text AS ingredient_count,
      COUNT(ri.product_id)::text AS mapped_product_count
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
    WHERE ${where.join(" AND ")}
    GROUP BY r.id, r.slug, r.title, r.short_description, r.description, r.related_brand, r.cover_image_url, r.source_confidence, r.status, c.name, c.slug
    ORDER BY r.sort_order, r.created_at DESC
    LIMIT $${values.length}`,
    values
  );

  return NextResponse.json({
    approved,
    filters: {
      category: category || null,
      brand: brand || null,
      search: search || null,
      limit,
    },
    recipes: result.rows.map((row) => mapRecipe(row, approved)),
  });
}
