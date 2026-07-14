import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const RECIPE_STATUSES = ["draft", "needs_review", "active", "inactive"] as const;
type RecipeStatus = (typeof RECIPE_STATUSES)[number];

export async function listAdminRecipesStable(
  identity: StaffIdentity,
  input: { status?: unknown; search?: unknown; limit?: number } = {},
  db: Pool = getDb(),
) {
  requireAdmin(identity);

  const requestedStatus = typeof input.status === "string" && input.status.trim()
    ? input.status.trim()
    : null;
  if (requestedStatus && !RECIPE_STATUSES.includes(requestedStatus as RecipeStatus)) {
    throw new OrderEngineError("RECIPE_STATUS_FILTER_INVALID", 400, "Unknown recipe status.");
  }

  const search = typeof input.search === "string" ? input.search.trim() : "";
  const requestedLimit = typeof input.limit === "number" ? input.limit : 50;
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 100);
  const values: unknown[] = [];
  const where: string[] = [];

  if (requestedStatus) {
    values.push(requestedStatus);
    where.push(`recipe.status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    where.push(`(recipe.title ILIKE $${values.length} OR recipe.slug ILIKE $${values.length})`);
  }
  values.push(limit);

  // Counts are correlated subqueries instead of aggregate joins. Production has
  // legacy Recipe tables whose constraints may differ from a clean database;
  // this query therefore does not depend on functional-dependency GROUP BY rules.
  const result = await db.query(
    `SELECT
       recipe.id::text,
       recipe.slug,
       recipe.title,
       recipe.short_description AS "shortDescription",
       recipe.status,
       current_version.workflow_status AS "workflowStatus",
       current_version.version_no AS "currentVersionNo",
       recipe.published_version_id::text AS "publishedVersionId",
       recipe.sort_order AS "sortOrder",
       recipe.yield_quantity::text AS "yieldQuantity",
       recipe.yield_unit AS "yieldUnit",
       category.name AS "recipeCategoryName",
       recipe.updated_at AS "updatedAt",
       (
         SELECT COUNT(*)::int
         FROM recipe_ingredients ingredient
         WHERE ingredient.recipe_id = recipe.id
       ) AS "ingredientCount",
       (
         SELECT COUNT(DISTINCT ingredient.catalog_variant_id)::int
         FROM recipe_ingredients ingredient
         WHERE ingredient.recipe_id = recipe.id
           AND ingredient.catalog_variant_id IS NOT NULL
       ) AS "catalogIngredientCount",
       (
         SELECT COUNT(*)::int
         FROM recipe_steps step
         WHERE step.recipe_id = recipe.id
       ) AS "stepCount",
       COUNT(*) OVER()::int AS "totalCount"
     FROM recipes recipe
     LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
     LEFT JOIN recipe_versions current_version ON current_version.id = recipe.current_version_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY recipe.updated_at DESC, recipe.id DESC
     LIMIT $${values.length}`,
    values,
  );

  return {
    recipes: result.rows.map(({ totalCount: _totalCount, ...recipe }) => recipe),
    total: Number(result.rows[0]?.totalCount ?? 0),
  };
}
