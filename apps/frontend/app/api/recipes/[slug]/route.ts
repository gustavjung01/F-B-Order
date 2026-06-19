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
};

type IngredientRow = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: string | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
  sort_order: number;
  sku: string | null;
  slug: string | null;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  wholesale_price: string | null;
  min_order_qty: number | null;
  category_name: string | null;
  category_slug: string | null;
};

type StepRow = {
  id: string;
  step_no: number;
  title: string | null;
  content: string;
  image_url: string | null;
};

async function isApprovedCustomer(userId?: string | null) {
  if (!userId) return false;
  const result = await db.query<{ approval_status: string }>(
    `SELECT approval_status FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.approval_status === "approved";
}

function numberOrNull(value: string | null) {
  if (value === null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function mapIngredient(row: IngredientRow, approved: boolean) {
  const hasActiveProduct = Boolean(row.product_id && row.slug);
  const price = approved && row.wholesale_price ? Number(row.wholesale_price) : null;

  return {
    id: row.id,
    productId: hasActiveProduct ? row.product_id : null,
    productName: row.product_name || row.name || "Nguyên liệu",
    quantity: approved ? numberOrNull(row.quantity) : null,
    unit: approved ? row.unit || "" : "",
    note: approved ? row.note || "" : "Định lượng mở sau khi hồ sơ quán được duyệt.",
    optional: row.optional,
    sortOrder: row.sort_order,
    product: hasActiveProduct ? {
      id: row.product_id,
      sku: row.sku || "",
      slug: row.slug || "",
      name: row.name || row.product_name || "Nguyên liệu",
      brand: row.brand || "",
      imageUrl: row.image_url || "",
      minOrderQty: row.min_order_qty || 1,
      categoryName: row.category_name || "Khác",
      categorySlug: row.category_slug || "khac",
      price,
      publicPriceHint: approved ? null : "Giá sỉ sau duyệt",
    } : null,
  };
}

function mapRecipe(row: RecipeRow, approved: boolean, ingredients: IngredientRow[], steps: StepRow[]) {
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
    isLocked: !approved,
    lockReason: approved ? null : "Đăng nhập và được duyệt hồ sơ quán để xem định lượng, cách làm chi tiết và thêm nguyên liệu vào giỏ.",
    ingredients: ingredients.map((ingredient) => mapIngredient(ingredient, approved)),
    steps: approved ? steps.map((step) => ({
      id: step.id,
      stepNo: step.step_no,
      title: step.title || `Bước ${step.step_no}`,
      content: step.content,
      imageUrl: step.image_url || "",
    })) : [],
  };
}

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const { userId } = await auth();
  const approved = await isApprovedCustomer(userId);
  const slug = decodeURIComponent(params.slug);

  const recipeResult = await db.query<RecipeRow>(
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
      c.slug AS category_slug
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    WHERE r.slug = $1
      AND r.status = 'active'
    LIMIT 1`,
    [slug]
  );

  const recipe = recipeResult.rows[0];
  if (!recipe) {
    return NextResponse.json({ error: "Không tìm thấy công thức" }, { status: 404 });
  }

  const [ingredientsResult, stepsResult] = await Promise.all([
    db.query<IngredientRow>(
      `SELECT
        ri.id,
        ri.product_id,
        ri.product_name,
        ri.quantity::text,
        ri.unit,
        ri.note,
        ri.optional,
        ri.sort_order,
        p.sku,
        p.slug,
        p.name,
        p.brand,
        p.image_url,
        p.wholesale_price::text,
        p.min_order_qty,
        c.name AS category_name,
        c.slug AS category_slug
      FROM recipe_ingredients ri
      LEFT JOIN products p ON p.id = ri.product_id AND p.status = 'active' AND p.is_active = true
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ri.recipe_id = $1
      ORDER BY ri.sort_order, ri.created_at`,
      [recipe.id]
    ),
    db.query<StepRow>(
      `SELECT id, step_no, title, content, image_url
       FROM recipe_steps
       WHERE recipe_id = $1
       ORDER BY step_no`,
      [recipe.id]
    ),
  ]);

  return NextResponse.json({
    approved,
    recipe: mapRecipe(recipe, approved, ingredientsResult.rows, stepsResult.rows),
  });
}
