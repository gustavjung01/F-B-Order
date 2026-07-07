import { Router } from "express";
import { getDb } from "../../db/pool";

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function list(value: unknown) { return Array.isArray(value) ? value : []; }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function fromSnapshot(row: any) {
  const snapshot = record(row.snapshot);
  return {
    id: row.id,
    slug: text(snapshot.slug) || row.slug,
    title: text(snapshot.title) || row.title,
    shortDescription: text(snapshot.shortDescription),
    description: text(snapshot.description),
    relatedBrand: text(snapshot.relatedBrand),
    coverImageUrl: text(snapshot.coverImageUrl),
    sourceConfidence: "published",
    status: "active",
    categoryName: row.category_name || "Công thức trà sữa",
    categorySlug: row.category_slug || "cong-thuc-tra-sua",
    isLocked: false,
    lockReason: null,
    ingredientCount: list(snapshot.ingredients).length,
    ingredients: list(snapshot.ingredients).map((item, index) => {
      const x = record(item);
      return {
        id: `${row.id}-ingredient-${index + 1}`,
        productName: text(x.productName),
        quantity: number(x.quantity),
        unit: text(x.unit),
        note: text(x.note),
        optional: Boolean(x.optional),
        sortOrder: index,
        catalogVariantId: text(x.catalogVariantId) || null,
      };
    }),
    steps: list(snapshot.steps).map((item, index) => {
      const x = record(item);
      return {
        id: `${row.id}-step-${index + 1}`,
        stepNo: index + 1,
        title: text(x.title),
        content: text(x.content),
        imageUrl: text(x.imageUrl),
      };
    }),
  };
}

export function createPublicRecipesRouter() {
  const router = Router();

  router.get("/", async (req, res) => {
    const db = getDb();
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 80);
    const search = String(req.query.search || "").trim();
    const result = await db.query(
      `SELECT
         recipe.id::text AS id,
         recipe.slug,
         recipe.title,
         version.snapshot,
         category.name AS category_name,
         category.slug AS category_slug
       FROM recipes recipe
       JOIN recipe_versions version ON version.id = recipe.published_version_id
       LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
       WHERE recipe.status = 'active'
         AND version.workflow_status = 'published'
         AND ($1 = '' OR version.snapshot->>'title' ILIKE '%' || $1 || '%')
       ORDER BY recipe.sort_order ASC, recipe.published_at DESC
       LIMIT $2`,
      [search, limit],
    );
    res.json({ approved: true, recipes: result.rows.map(fromSnapshot) });
  });

  router.get("/:slug", async (req, res) => {
    const db = getDb();
    const result = await db.query(
      `SELECT
         recipe.id::text AS id,
         recipe.slug,
         recipe.title,
         version.snapshot,
         category.name AS category_name,
         category.slug AS category_slug
       FROM recipes recipe
       JOIN recipe_versions version ON version.id = recipe.published_version_id
       LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
       WHERE recipe.status = 'active'
         AND version.workflow_status = 'published'
         AND (version.snapshot->>'slug' = $1 OR recipe.slug = $1)
       LIMIT 1`,
      [req.params.slug],
    );
    if (!result.rowCount) return res.status(404).json({ error: "RECIPE_NOT_FOUND" });
    res.json({ recipe: fromSnapshot(result.rows[0]) });
  });

  return router;
}