import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
};

type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  children: CategoryNode[];
};

function buildCategoryTree(rows: CategoryRow[]) {
  const nodes = new Map<string, CategoryNode>();

  rows.forEach((row) => {
    nodes.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sortOrder: row.sort_order,
      children: [],
    });
  });

  const roots: CategoryNode[] = [];

  rows.forEach((row) => {
    const node = nodes.get(row.id);
    if (!node) return;

    if (row.parent_id) {
      const parent = nodes.get(row.parent_id);
      if (parent) {
        parent.children.push(node);
        return;
      }
    }

    roots.push(node);
  });

  const sortNodes = (items: CategoryNode[]) => {
    items.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "vi"));
    items.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);
  return roots;
}

export async function GET() {
  const result = await db.query<CategoryRow>(
    `SELECT id, parent_id, name, slug, sort_order
     FROM categories
     WHERE is_active = true
     ORDER BY sort_order, name`
  );

  const categories = buildCategoryTree(result.rows);
  const primaryTabs = categories.filter((category) => category.slug !== "brand-distribution");
  const brandGroup = categories.find((category) => category.slug === "brand-distribution");

  return NextResponse.json({
    categories,
    primaryTabs,
    brands: brandGroup?.children || [],
  });
}
