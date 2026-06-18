import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  image_url: string | null;
  base_price: string;
  wholesale_price: string;
  min_order_qty: number;
  status: string;
  category_name: string | null;
  category_slug: string | null;
};

async function isApprovedCustomer(userId?: string | null) {
  if (!userId) return false;
  const result = await db.query<{ approval_status: string }>(
    `SELECT approval_status FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.approval_status === "approved";
}

export async function GET() {
  const { userId } = await auth();
  const approved = await isApprovedCustomer(userId);

  const result = await db.query<ProductRow>(
    `SELECT
      p.id,
      p.sku,
      p.name,
      p.description,
      p.unit,
      p.image_url,
      p.base_price::text,
      p.wholesale_price::text,
      p.min_order_qty,
      p.status,
      c.name AS category_name,
      c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'active'
    ORDER BY c.sort_order NULLS LAST, p.sort_order, p.created_at DESC`
  );

  return NextResponse.json({
    approved,
    products: result.rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description || "",
      unit: row.unit,
      imageUrl: row.image_url || "",
      minOrderQty: row.min_order_qty,
      categoryName: row.category_name || "Khac",
      categorySlug: row.category_slug || "khac",
      price: approved ? Number(row.wholesale_price) : null,
      publicPriceHint: approved ? null : "Gia si sau duyet",
    })),
  });
}
