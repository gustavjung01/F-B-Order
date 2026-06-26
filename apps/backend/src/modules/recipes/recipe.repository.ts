import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type {
  RecipeBusinessTipRow,
  RecipeCardRow,
  RecipeDetailRow,
  RecipeIngredientRow,
  RecipeMistakeRow,
  RecipeProductLinkRow,
  RecipeSeasonalRuleRow,
  RecipeStepRow,
} from "./recipe.presenter";
import type { RecipeListFilters } from "./recipe.types";

const PUBLIC_RECIPE_CLAUSES = [
  "recipe.status = 'published'",
  "recipe.visibility = 'public'",
];

function cardSelect(recipeAlias = "recipe") {
  return `${recipeAlias}.id::text AS id,
    ${recipeAlias}.slug,
    ${recipeAlias}.title,
    COALESCE(${recipeAlias}.short_description, '') AS short_description,
    ${recipeAlias}.cover_image_url,
    ${recipeAlias}.difficulty,
    ${recipeAlias}.prep_minutes,
    ${recipeAlias}.cook_minutes,
    ${recipeAlias}.yield_quantity::text,
    ${recipeAlias}.yield_unit,
    ${recipeAlias}.published_at,
    category.id::text AS category_id,
    category.slug AS category_slug,
    category.name AS category_name,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', tag.id::text, 'slug', tag.slug, 'name', tag.name)
        ORDER BY tag.name, tag.id
      )
      FROM recipe_tag_links tag_link
      JOIN recipe_tags tag ON tag.id = tag_link.tag_id
      WHERE tag_link.recipe_id = ${recipeAlias}.id
    ), '[]'::jsonb) AS tags,
    (SELECT COUNT(*)::int FROM recipe_ingredients ingredient WHERE ingredient.recipe_id = ${recipeAlias}.id) AS ingredient_count,
    (SELECT COUNT(*)::int FROM recipe_steps step WHERE step.recipe_id = ${recipeAlias}.id) AS step_count`;
}

function listWhere(filters: RecipeListFilters) {
  const values: unknown[] = [];
  const clauses = [...PUBLIC_RECIPE_CLAUSES];

  if (filters.query) {
    values.push(`%${filters.query}%`);
    clauses.push(`(
      recipe.title ILIKE $${values.length}
      OR COALESCE(recipe.short_description, '') ILIKE $${values.length}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(recipe.aliases) alias_value
        WHERE alias_value ILIKE $${values.length}
      )
    )`);
  }

  if (filters.category) {
    values.push(filters.category);
    clauses.push(`category.slug = $${values.length}`);
  }

  if (filters.tag) {
    values.push(filters.tag);
    clauses.push(`EXISTS (
      SELECT 1
      FROM recipe_tag_links filter_tag_link
      JOIN recipe_tags filter_tag ON filter_tag.id = filter_tag_link.tag_id
      WHERE filter_tag_link.recipe_id = recipe.id
        AND filter_tag.slug = $${values.length}
    )`);
  }

  return { clauses, values };
}

export async function listPublicRecipes(
  filters: RecipeListFilters,
  db: Pool = getDb(),
): Promise<{ rows: RecipeCardRow[]; total: number }> {
  const query = listWhere(filters);
  const countValues = [...query.values];
  const listValues = [...query.values, filters.limit, filters.offset];
  const limitParameter = listValues.length - 1;
  const offsetParameter = listValues.length;

  const [listResult, countResult] = await Promise.all([
    db.query<RecipeCardRow>(
      `SELECT ${cardSelect()}
       FROM recipes recipe
       LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
       WHERE ${query.clauses.join(" AND ")}
       ORDER BY recipe.sort_order, recipe.published_at DESC, recipe.id
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      listValues,
    ),
    db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM recipes recipe
       LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
       WHERE ${query.clauses.join(" AND ")}`,
      countValues,
    ),
  ]);

  return {
    rows: listResult.rows,
    total: Number(countResult.rows[0]?.total) || 0,
  };
}

export async function findPublicRecipeCardById(
  recipeId: string,
  db: Pool = getDb(),
): Promise<RecipeCardRow | null> {
  const result = await db.query<RecipeCardRow>(
    `SELECT ${cardSelect()}
     FROM recipes recipe
     LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
     WHERE recipe.id = $1::uuid
       AND ${PUBLIC_RECIPE_CLAUSES.join(" AND ")}`,
    [recipeId],
  );
  return result.rows[0] || null;
}

export async function findPublicRecipeDetailRow(
  slug: string,
  db: Pool = getDb(),
): Promise<RecipeDetailRow | null> {
  const result = await db.query<RecipeDetailRow>(
    `SELECT ${cardSelect()}, recipe.aliases
     FROM recipes recipe
     LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
     WHERE recipe.slug = $1
       AND ${PUBLIC_RECIPE_CLAUSES.join(" AND ")}`,
    [slug],
  );
  return result.rows[0] || null;
}

export async function loadPublicRecipeSections(recipeId: string, db: Pool = getDb()) {
  const [ingredients, steps, mistakes, businessTips, seasonalRules, productLinks] = await Promise.all([
    db.query<RecipeIngredientRow>(
      `SELECT
         ingredient.id::text,
         ingredient.name,
         ingredient.source_type,
         ingredient.usage_quantity::text,
         ingredient.usage_unit,
         ingredient.package_content_quantity::text,
         ingredient.package_content_unit,
         ingredient.waste_percent::text,
         ingredient.usable_yield_percent::text,
         ingredient.default_selections,
         ingredient.selection_key,
         ingredient.is_optional,
         ingredient.is_cart_ready,
         ingredient.sort_order,
         ingredient.note,
         ingredient.catalog_product_id::text,
         ingredient.catalog_variant_id::text,
         ingredient.catalog_product_name_snapshot,
         ingredient.catalog_variant_name_snapshot,
         ingredient.sku_snapshot,
         ingredient.specification_snapshot,
         ingredient.selection_key_snapshot,
         catalog_product.name AS current_product_name,
         catalog_product.status AS current_product_status,
         catalog_variant.name AS current_variant_name,
         catalog_variant.sku AS current_sku,
         catalog_variant.status AS current_variant_status,
         catalog_variant.options AS current_variant_options,
         catalog_variant.is_active AS current_variant_is_active,
         catalog_variant.is_public AS current_variant_is_public,
         catalog_variant.is_orderable AS current_variant_is_orderable
       FROM recipe_ingredients ingredient
       LEFT JOIN catalog_products catalog_product ON catalog_product.id = ingredient.catalog_product_id
       LEFT JOIN catalog_variants catalog_variant ON catalog_variant.id = ingredient.catalog_variant_id
       WHERE ingredient.recipe_id = $1::uuid
       ORDER BY ingredient.sort_order, ingredient.id`,
      [recipeId],
    ),
    db.query<RecipeStepRow>(
      `SELECT
         step.id::text,
         step.title,
         step.instruction,
         step.duration_seconds,
         step.temperature_celsius::text,
         step.success_marker,
         step.warning,
         step.media_url,
         step.sort_order
       FROM recipe_steps step
       WHERE step.recipe_id = $1::uuid
       ORDER BY step.sort_order, step.id`,
      [recipeId],
    ),
    db.query<RecipeMistakeRow>(
      `SELECT
         mistake.id::text,
         mistake.title,
         mistake.symptom,
         mistake.likely_causes,
         mistake.immediate_fix,
         mistake.prevention,
         mistake.related_step_order,
         mistake.severity,
         mistake.sort_order
       FROM recipe_mistakes mistake
       WHERE mistake.recipe_id = $1::uuid
       ORDER BY mistake.sort_order, mistake.id`,
      [recipeId],
    ),
    db.query<RecipeBusinessTipRow>(
      `SELECT
         tip.id::text,
         tip.title,
         tip.recommendation,
         tip.target_customer,
         tip.selling_moment,
         tip.combo_suggestion,
         tip.packaging_suggestion,
         tip.storage_suggestion,
         tip.batch_preparation_suggestion,
         tip.sort_order
       FROM recipe_business_tips tip
       WHERE tip.recipe_id = $1::uuid
       ORDER BY tip.sort_order, tip.id`,
      [recipeId],
    ),
    db.query<RecipeSeasonalRuleRow>(
      `SELECT
         seasonal.id::text,
         seasonal.rule_type,
         seasonal.title,
         seasonal.start_month,
         seasonal.end_month,
         seasonal.festival,
         seasonal.weather_condition,
         seasonal.regions,
         seasonal.suitability_reason,
         seasonal.marketing_message,
         seasonal.priority
       FROM recipe_seasonal_rules seasonal
       WHERE seasonal.recipe_id = $1::uuid
       ORDER BY seasonal.priority DESC, seasonal.created_at, seasonal.id`,
      [recipeId],
    ),
    db.query<RecipeProductLinkRow>(
      `SELECT
         link.id::text,
         link.catalog_product_id::text,
         link.catalog_variant_id::text,
         link.selections,
         link.selection_key,
         link.catalog_product_name_snapshot,
         link.catalog_variant_name_snapshot,
         link.sku_snapshot,
         link.specification_snapshot,
         link.note,
         link.sort_order,
         catalog_product.name AS current_product_name,
         catalog_product.status AS current_product_status,
         catalog_variant.name AS current_variant_name,
         catalog_variant.sku AS current_sku,
         catalog_variant.status AS current_variant_status,
         catalog_variant.options AS current_variant_options,
         catalog_variant.is_active AS current_variant_is_active,
         catalog_variant.is_public AS current_variant_is_public,
         catalog_variant.is_orderable AS current_variant_is_orderable
       FROM recipe_product_links link
       LEFT JOIN catalog_products catalog_product ON catalog_product.id = link.catalog_product_id
       LEFT JOIN catalog_variants catalog_variant ON catalog_variant.id = link.catalog_variant_id
       WHERE link.recipe_id = $1::uuid
       ORDER BY link.sort_order, link.id`,
      [recipeId],
    ),
  ]);

  return {
    ingredients: ingredients.rows,
    steps: steps.rows,
    mistakes: mistakes.rows,
    businessTips: businessTips.rows,
    seasonalRules: seasonalRules.rows,
    productLinks: productLinks.rows,
  };
}

export async function listRelatedPublicRecipes(
  source: RecipeCardRow,
  limit: number,
  db: Pool = getDb(),
): Promise<RecipeCardRow[]> {
  const tagResult = await db.query<{ tag_id: string }>(
    `SELECT tag_id::text
     FROM recipe_tag_links
     WHERE recipe_id = $1::uuid`,
    [source.id],
  );
  const tagIds = tagResult.rows.map((row) => row.tag_id);
  const categoryId = source.category?.id;

  if (!categoryId && tagIds.length === 0) return [];

  const result = await db.query<RecipeCardRow & { relevance_score: number }>(
    `SELECT ${cardSelect()},
       (
         CASE WHEN $2::uuid IS NOT NULL AND recipe.recipe_category_id = $2::uuid THEN 2 ELSE 0 END
         + (
           SELECT COUNT(*)::int
           FROM recipe_tag_links related_tag_link
           WHERE related_tag_link.recipe_id = recipe.id
             AND related_tag_link.tag_id = ANY($3::uuid[])
         )
       ) AS relevance_score
     FROM recipes recipe
     LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
     WHERE recipe.id <> $1::uuid
       AND ${PUBLIC_RECIPE_CLAUSES.join(" AND ")}
       AND (
         ($2::uuid IS NOT NULL AND recipe.recipe_category_id = $2::uuid)
         OR EXISTS (
           SELECT 1
           FROM recipe_tag_links shared_tag_link
           WHERE shared_tag_link.recipe_id = recipe.id
             AND shared_tag_link.tag_id = ANY($3::uuid[])
         )
       )
     ORDER BY relevance_score DESC, recipe.published_at DESC, recipe.id
     LIMIT $4`,
    [source.id, categoryId || null, tagIds, limit],
  );

  return result.rows;
}
