import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { getDb } from "../src/db/pool";

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const marker = `RecipeRead${suffix}`;
  const categoryIds: string[] = [];
  const tagIds: string[] = [];
  const recipeIds: string[] = [];
  const catalogProductIds: string[] = [];
  const catalogVariantIds: string[] = [];

  async function createCategory(name: string) {
    const result = await db.query<{ id: string; slug: string }>(
      `INSERT INTO recipe_categories (name, slug, description, sort_order, is_active)
       VALUES ($1, $2, 'Recipe read API integration fixture', 1, true)
       RETURNING id::text, slug`,
      [name, `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`],
    );
    categoryIds.push(result.rows[0].id);
    return result.rows[0];
  }

  async function createTag(name: string) {
    const result = await db.query<{ id: string; slug: string }>(
      `INSERT INTO recipe_tags (name, slug)
       VALUES ($1, $2)
       RETURNING id::text, slug`,
      [name, `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`],
    );
    tagIds.push(result.rows[0].id);
    return result.rows[0];
  }

  async function createRecipe(input: {
    title: string;
    slug: string;
    categoryId: string;
    visibility: "public" | "internal";
    published: boolean;
    aliases?: string[];
    tagIds?: string[];
    sortOrder: number;
  }) {
    const result = await db.query<{ id: string }>(
      `INSERT INTO recipes (
         slug, title, short_description, recipe_category_id, aliases,
         status, visibility, difficulty, prep_minutes, cook_minutes,
         yield_quantity, yield_unit, current_version, published_at, sort_order
       ) VALUES (
         $1, $2, $3, $4::uuid, $5::jsonb,
         'draft', $6, 'easy', 5, 10,
         10, 'portion', 0, NULL, $7
       )
       RETURNING id::text`,
      [
        input.slug,
        input.title,
        `${marker} public read fixture`,
        input.categoryId,
        JSON.stringify(input.aliases || []),
        input.visibility,
        input.sortOrder,
      ],
    );
    const recipeId = result.rows[0].id;
    recipeIds.push(recipeId);

    for (const tagId of input.tagIds || []) {
      await db.query(
        `INSERT INTO recipe_tag_links (recipe_id, tag_id)
         VALUES ($1::uuid, $2::uuid)`,
        [recipeId, tagId],
      );
    }

    if (input.published) {
      await db.query(
        `INSERT INTO recipe_versions (recipe_id, version_number, snapshot, source)
         VALUES ($1::uuid, 1, $2::jsonb, 'human')`,
        [recipeId, JSON.stringify({ recipeId, versionNumber: 1, title: input.title })],
      );
      await db.query(
        `UPDATE recipes
         SET status = 'published', current_version = 1, published_at = now()
         WHERE id = $1::uuid`,
        [recipeId],
      );
    }

    return recipeId;
  }

  const foodCategory = await createCategory(`Food${suffix.slice(0, 6)}`);
  const drinkCategory = await createCategory(`Drink${suffix.slice(0, 6)}`);
  const sharedTag = await createTag(`Shared${suffix.slice(0, 6)}`);
  const sourceTag = await createTag(`Source${suffix.slice(0, 6)}`);

  const sourceRecipeId = await createRecipe({
    title: `${marker} Source`,
    slug: `recipe-read-source-${suffix}`,
    categoryId: foodCategory.id,
    visibility: "public",
    published: true,
    aliases: [`Alias ${marker}`],
    tagIds: [sharedTag.id, sourceTag.id],
    sortOrder: 1,
  });
  const relatedRecipeId = await createRecipe({
    title: `${marker} Related`,
    slug: `recipe-read-related-${suffix}`,
    categoryId: foodCategory.id,
    visibility: "public",
    published: true,
    tagIds: [sharedTag.id],
    sortOrder: 2,
  });
  const unrelatedRecipeId = await createRecipe({
    title: `${marker} Unrelated`,
    slug: `recipe-read-unrelated-${suffix}`,
    categoryId: drinkCategory.id,
    visibility: "public",
    published: true,
    sortOrder: 3,
  });
  const internalRecipeId = await createRecipe({
    title: `${marker} Internal`,
    slug: `recipe-read-internal-${suffix}`,
    categoryId: foodCategory.id,
    visibility: "internal",
    published: true,
    tagIds: [sharedTag.id],
    sortOrder: 4,
  });
  const draftRecipeId = await createRecipe({
    title: `${marker} Draft`,
    slug: `recipe-read-draft-${suffix}`,
    categoryId: foodCategory.id,
    visibility: "public",
    published: false,
    tagIds: [sharedTag.id],
    sortOrder: 5,
  });

  const catalogProductResult = await db.query<{ id: string }>(
    `INSERT INTO catalog_products (
       product_key, name, industry, industry_key, status, sort_order
     ) VALUES ($1, $2, 'Nguyên liệu kiểm thử', 'recipe-read-test', 'inactive', 1)
     RETURNING id::text`,
    [`recipe-read-product-${suffix}`, `${marker} Inactive product`],
  );
  const catalogProductId = catalogProductResult.rows[0].id;
  catalogProductIds.push(catalogProductId);

  const catalogVariantResult = await db.query<{ id: string }>(
    `INSERT INTO catalog_variants (
       product_id, variant_key, sku, name, options, price_mode, shop_price,
       status, is_active, is_public, is_orderable, sort_order
     ) VALUES (
       $1::uuid, $2, $3, $4, '{"size":"700 ml","sell_unit":"chai"}'::jsonb,
       'fixed', 50000, 'inactive', false, false, false, 1
     ) RETURNING id::text`,
    [
      catalogProductId,
      `recipe-read-variant-${suffix}`,
      `RR-${suffix.slice(0, 20).toUpperCase()}`,
      `${marker} Inactive variant`,
    ],
  );
  const catalogVariantId = catalogVariantResult.rows[0].id;
  catalogVariantIds.push(catalogVariantId);

  await db.query(
    `INSERT INTO recipe_ingredients (
       recipe_id, name, source_type, usage_quantity, usage_unit,
       is_optional, sort_order, note
     ) VALUES ($1::uuid, 'Nước lọc', 'external', 1000, 'ml', false, 1, 'External ingredient')`,
    [sourceRecipeId],
  );
  await db.query(
    `INSERT INTO recipe_ingredients (
       recipe_id, name, source_type, catalog_product_id, catalog_variant_id,
       default_selections, selection_key, usage_quantity, usage_unit,
       package_content_quantity, package_content_unit, waste_percent,
       usable_yield_percent, is_optional, is_cart_ready,
       catalog_product_name_snapshot, catalog_variant_name_snapshot,
       sku_snapshot, specification_snapshot, selection_key_snapshot,
       sort_order, note
     ) VALUES (
       $1::uuid, 'Siro đào', 'catalog', $2::uuid, $3::uuid,
       '{"flavor":"Đào"}'::jsonb, 'flavor=%C4%90%C3%A0o', 300, 'ml',
       700, 'ml', 2, 98, false, true,
       'Snapshot product', 'Snapshot variant', 'SNAPSHOT-SKU',
       '700 ml · ĐVT: chai', 'flavor=%C4%90%C3%A0o',
       2, 'Inactive SKU must not hide the recipe'
     )`,
    [sourceRecipeId, catalogProductId, catalogVariantId],
  );

  await db.query(
    `INSERT INTO recipe_steps (
       recipe_id, step_no, title, content, instruction, duration_seconds,
       temperature_celsius, success_marker, warning, sort_order
     ) VALUES (
       $1::uuid, 1, 'Pha nền', 'Pha nền', 'Pha nguyên liệu theo định lượng.',
       120, 80, 'Hỗn hợp đồng nhất', 'Không đun quá lâu', 1
     )`,
    [sourceRecipeId],
  );
  await db.query(
    `INSERT INTO recipe_mistakes (
       recipe_id, title, symptom, likely_causes, immediate_fix,
       prevention, related_step_order, severity, sort_order
     ) VALUES (
       $1::uuid, 'Vị quá ngọt', 'Ngọt gắt', '["Dùng quá nhiều siro"]'::jsonb,
       'Bổ sung trà nền theo từng lượng nhỏ', 'Cân đúng định lượng', 1, 'medium', 1
     )`,
    [sourceRecipeId],
  );
  await db.query(
    `INSERT INTO recipe_business_tips (
       recipe_id, title, recommendation, target_customer, selling_moment, sort_order
     ) VALUES (
       $1::uuid, 'Bán theo mẻ', 'Chuẩn hóa mẻ 10 phần.', 'Quán nhỏ', 'Buổi chiều', 1
     )`,
    [sourceRecipeId],
  );
  await db.query(
    `INSERT INTO recipe_seasonal_rules (
       recipe_id, rule_type, title, weather_condition, regions,
       suitability_reason, marketing_message, priority
     ) VALUES (
       $1::uuid, 'weather', 'Ngày nóng', 'Nắng nóng', '["Miền Nam"]'::jsonb,
       'Phù hợp đồ uống lạnh', 'Giải nhiệt ngày nóng', 100
     )`,
    [sourceRecipeId],
  );
  await db.query(
    `INSERT INTO recipe_product_links (
       recipe_id, catalog_product_id, catalog_variant_id, selections,
       selection_key, catalog_product_name_snapshot, catalog_variant_name_snapshot,
       sku_snapshot, specification_snapshot, note, sort_order
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, '{"flavor":"Đào"}'::jsonb,
       'flavor=%C4%90%C3%A0o', 'Snapshot product', 'Snapshot variant',
       'SNAPSHOT-SKU', '700 ml · ĐVT: chai', 'Recommended product', 1
     )`,
    [sourceRecipeId, catalogProductId, catalogVariantId],
  );

  for (const recipeId of [relatedRecipeId, unrelatedRecipeId]) {
    await db.query(
      `INSERT INTO recipe_ingredients (
         recipe_id, name, source_type, usage_quantity, usage_unit, sort_order
       ) VALUES ($1::uuid, 'Nước lọc', 'external', 500, 'ml', 1)`,
      [recipeId],
    );
    await db.query(
      `INSERT INTO recipe_steps (recipe_id, step_no, content, instruction, sort_order)
       VALUES ($1::uuid, 1, 'Pha món', 'Pha món', 1)`,
      [recipeId],
    );
  }

  const app = createApp({
    port: 0,
    serviceName: "recipe-read-api-test",
    corsOrigin: "http://localhost:3000",
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const listResponse = await fetch(`${baseUrl}/api/recipes?q=${encodeURIComponent(marker)}&limit=20`);
    assert.equal(listResponse.status, 200);
    assert.match(listResponse.headers.get("cache-control") || "", /no-store/);
    const listBody = await listResponse.json() as {
      recipes: Array<{ id: string; slug: string; title: string }>;
      total: number;
      pagination: { limit: number; offset: number; hasMore: boolean };
    };
    assert.equal(listBody.total, 3);
    assert.deepEqual(
      new Set(listBody.recipes.map((recipe) => recipe.id)),
      new Set([sourceRecipeId, relatedRecipeId, unrelatedRecipeId]),
    );
    assert.ok(!listBody.recipes.some((recipe) => recipe.id === internalRecipeId || recipe.id === draftRecipeId));

    const aliasResponse = await fetch(`${baseUrl}/recipes?q=${encodeURIComponent(`Alias ${marker}`)}`);
    assert.equal(aliasResponse.status, 200);
    const aliasBody = await aliasResponse.json() as { recipes: Array<{ id: string }> };
    assert.deepEqual(aliasBody.recipes.map((recipe) => recipe.id), [sourceRecipeId]);

    const categoryResponse = await fetch(`${baseUrl}/api/recipes?category=${foodCategory.slug}&q=${encodeURIComponent(marker)}`);
    assert.equal(categoryResponse.status, 200);
    const categoryBody = await categoryResponse.json() as { recipes: Array<{ id: string }>; total: number };
    assert.equal(categoryBody.total, 2);
    assert.deepEqual(new Set(categoryBody.recipes.map((recipe) => recipe.id)), new Set([sourceRecipeId, relatedRecipeId]));

    const tagResponse = await fetch(`${baseUrl}/api/recipes?tag=${sharedTag.slug}&q=${encodeURIComponent(marker)}`);
    assert.equal(tagResponse.status, 200);
    const tagBody = await tagResponse.json() as { recipes: Array<{ id: string }>; total: number };
    assert.equal(tagBody.total, 2);
    assert.deepEqual(new Set(tagBody.recipes.map((recipe) => recipe.id)), new Set([sourceRecipeId, relatedRecipeId]));

    const paginationResponse = await fetch(`${baseUrl}/api/recipes?q=${encodeURIComponent(marker)}&limit=1&offset=0`);
    assert.equal(paginationResponse.status, 200);
    const paginationBody = await paginationResponse.json() as {
      recipes: unknown[];
      total: number;
      pagination: { hasMore: boolean };
    };
    assert.equal(paginationBody.recipes.length, 1);
    assert.equal(paginationBody.total, 3);
    assert.equal(paginationBody.pagination.hasMore, true);

    const detailResponse = await fetch(`${baseUrl}/api/recipes/recipe-read-source-${suffix}`);
    assert.equal(detailResponse.status, 200);
    const detailBody = await detailResponse.json() as {
      recipe: {
        id: string;
        aliases: string[];
        ingredients: Array<{
          sourceType: string;
          catalog: null | {
            availability: string;
            savedCartReady: boolean;
            snapshot: { sku: string | null };
            current: { isOrderable: boolean };
          };
        }>;
        steps: unknown[];
        mistakes: unknown[];
        businessTips: unknown[];
        seasonalRules: unknown[];
        productLinks: Array<{ availability: string }>;
        provenance?: unknown;
      };
    };
    assert.equal(detailBody.recipe.id, sourceRecipeId);
    assert.deepEqual(detailBody.recipe.aliases, [`Alias ${marker}`]);
    assert.equal(detailBody.recipe.ingredients.length, 2);
    assert.equal(detailBody.recipe.steps.length, 1);
    assert.equal(detailBody.recipe.mistakes.length, 1);
    assert.equal(detailBody.recipe.businessTips.length, 1);
    assert.equal(detailBody.recipe.seasonalRules.length, 1);
    assert.equal(detailBody.recipe.productLinks.length, 1);
    assert.equal(detailBody.recipe.provenance, undefined);
    const catalogIngredient = detailBody.recipe.ingredients.find((ingredient) => ingredient.sourceType === "catalog");
    assert.ok(catalogIngredient?.catalog);
    assert.equal(catalogIngredient.catalog.availability, "inactive");
    assert.equal(catalogIngredient.catalog.savedCartReady, true);
    assert.equal(catalogIngredient.catalog.snapshot.sku, "SNAPSHOT-SKU");
    assert.equal(catalogIngredient.catalog.current.isOrderable, false);
    assert.equal(detailBody.recipe.productLinks[0].availability, "inactive");

    for (const hiddenSlug of [`recipe-read-internal-${suffix}`, `recipe-read-draft-${suffix}`]) {
      const hiddenResponse = await fetch(`${baseUrl}/api/recipes/${hiddenSlug}`);
      assert.equal(hiddenResponse.status, 404);
    }

    const relatedResponse = await fetch(`${baseUrl}/api/recipes/${sourceRecipeId}/related?limit=6`);
    assert.equal(relatedResponse.status, 200);
    const relatedBody = await relatedResponse.json() as { recipes: Array<{ id: string }>; total: number };
    assert.ok(relatedBody.recipes.some((recipe) => recipe.id === relatedRecipeId));
    assert.ok(!relatedBody.recipes.some((recipe) => [sourceRecipeId, unrelatedRecipeId, internalRecipeId, draftRecipeId].includes(recipe.id)));

    const hiddenRelatedResponse = await fetch(`${baseUrl}/api/recipes/${internalRecipeId}/related`);
    assert.equal(hiddenRelatedResponse.status, 404);

    const invalidSlugResponse = await fetch(`${baseUrl}/api/recipes/INVALID!`);
    assert.equal(invalidSlugResponse.status, 400);
    const invalidSlugBody = await invalidSlugResponse.json() as { error: string };
    assert.equal(invalidSlugBody.error, "INVALID_RECIPE_SLUG");

    const invalidIdResponse = await fetch(`${baseUrl}/api/recipes/not-a-uuid/related`);
    assert.equal(invalidIdResponse.status, 400);
    const invalidIdBody = await invalidIdResponse.json() as { error: string };
    assert.equal(invalidIdBody.error, "INVALID_RECIPE_ID");

    console.log("Recipe read API contract passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    if (recipeIds.length > 0) {
      await db.query(`DELETE FROM recipes WHERE id = ANY($1::uuid[])`, [recipeIds]);
    }
    if (tagIds.length > 0) {
      await db.query(`DELETE FROM recipe_tags WHERE id = ANY($1::uuid[])`, [tagIds]);
    }
    if (categoryIds.length > 0) {
      await db.query(`DELETE FROM recipe_categories WHERE id = ANY($1::uuid[])`, [categoryIds]);
    }
    if (catalogVariantIds.length > 0) {
      await db.query(`DELETE FROM catalog_variants WHERE id = ANY($1::uuid[])`, [catalogVariantIds]);
    }
    if (catalogProductIds.length > 0) {
      await db.query(`DELETE FROM catalog_products WHERE id = ANY($1::uuid[])`, [catalogProductIds]);
    }
    await db.end();
  }
}

main().catch(async (error) => {
  console.error("Recipe read API contract failed.");
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
