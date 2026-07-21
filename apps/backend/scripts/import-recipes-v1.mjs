import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pgModule = require(process.env.PG_MODULE_PATH || "pg");
const pg = pgModule.default || pgModule;

const apply = process.argv.includes("--apply");
const root = path.resolve(import.meta.dirname, "../../..");
const dir = path.join(root, "data/recipes/bepsi-recipes-v1");
const recipesDoc = JSON.parse(await fs.readFile(path.join(dir,"recipes.standard.json"),"utf8"));
const imageDoc = JSON.parse(await fs.readFile(path.join(dir,"image-map.json"),"utf8"));
const catalogDoc = JSON.parse(await fs.readFile(path.join(dir,"catalog-map.json"),"utf8"));
const imageBySlug = new Map(imageDoc.entries.map(x=>[x.recipeSlug,x.publicUrl]));
const catalogByKey = new Map(Object.entries(catalogDoc.entries || {}));
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL or BEPSI_DATABASE_URL is required");
const local = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const pool = new pg.Pool({connectionString,ssl:local?false:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=="false"}});
const client = await pool.connect();
try {
  if (!apply) {
    const requiredCatalogKeys = new Set(
      recipesDoc.recipes.flatMap((recipe) =>
        (recipe.ingredients || [])
          .filter((ingredient) => ingredient.sourceType === "catalog_candidate")
          .map((ingredient) => ingredient.catalogKey),
      ),
    );
    const mappedEntries = Object.entries(catalogDoc.entries || {}).filter(
      ([key, entry]) => requiredCatalogKeys.has(key) && entry.catalogVariantId,
    );
    const unmappedEntries = Object.entries(catalogDoc.entries || {}).filter(
      ([key, entry]) => requiredCatalogKeys.has(key) && !entry.catalogVariantId,
    );
    const invalidVariants = [];
    for (const [key, entry] of mappedEntries) {
      const result = await client.query(
        `SELECT v.id::text AS variant_id, v.product_id::text AS product_id, v.sku, v.name AS variant_name, p.name AS product_name
         FROM catalog_variants v
         JOIN catalog_products p ON p.id = v.product_id
         WHERE v.id = $1`,
        [entry.catalogVariantId],
      );
      if (!result.rows[0]) invalidVariants.push({ key, catalogVariantId: entry.catalogVariantId });
    }
    const missingImages = imageDoc.entries.filter((entry) => entry.fileName && !entry.publicUrl).map((entry) => entry.recipeSlug);
    const summary = {
      ok: unmappedEntries.length === 0 && invalidVariants.length === 0 && missingImages.length === 0,
      recipes: recipesDoc.recipes.length,
      categories: recipesDoc.categories.length,
      mappedCatalogKeys: mappedEntries.length,
      unmappedCatalogKeys: unmappedEntries.map(([key]) => key),
      invalidVariants,
      uploadedImages: imageDoc.entries.filter((entry) => entry.publicUrl).length,
      missingImages,
      mode: "dry-run",
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) process.exitCode = 1;
  } else {
    const categoryRows = recipesDoc.categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      sort_order: category.sortOrder || 0,
    }));
    const recipeRows = recipesDoc.recipes.map((recipe) => ({
      slug: recipe.slug,
      title: recipe.title,
      short_description: recipe.shortDescription,
      description: recipe.description,
      category_slug: recipe.recipeCategory.slug,
      cover_image_url: imageBySlug.get(recipe.slug) || null,
      sort_order: recipe.sortOrder || 0,
      yield_quantity: recipe.yieldQuantity,
      yield_unit: recipe.yieldUnit,
      recipe_kind: recipe.recipeKind,
      visibility: recipe.visibility,
      serving_size_ml: recipe.servingSizeMl,
      content_source_key: recipe.contentSourceKey,
      operational_notes: recipe.operationalNotes || [],
    }));
    const ingredientRows = recipesDoc.recipes.flatMap((recipe) =>
      (recipe.ingredients || []).map((ingredient) => {
        const mapped = ingredient.catalogKey ? catalogByKey.get(ingredient.catalogKey) : null;
        return {
          recipe_slug: recipe.slug,
          product_name: ingredient.productName,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          note: ingredient.note,
          optional: ingredient.optional || false,
          sort_order: ingredient.sortOrder || 0,
          source_type: ingredient.sourceType || "manual",
          source_recipe_slug: ingredient.sourceRecipeSlug || null,
          catalog_key: ingredient.catalogKey || null,
          catalog_variant_id: mapped?.catalogVariantId || null,
        };
      }),
    );
    const stepRows = recipesDoc.recipes.flatMap((recipe) =>
      (recipe.steps || []).map((step) => ({
        recipe_slug: recipe.slug,
        step_no: step.stepNo,
        title: step.title,
        content: step.content,
        sort_order: step.sortOrder ?? step.stepNo,
      })),
    );

    const jsonLiteral = (value, tag) => {
      const text = JSON.stringify(value);
      if (text.includes(`$${tag}$`)) throw new Error(`Unexpected ${tag} delimiter in JSON payload`);
      return `$${tag}$${text}$${tag}$`;
    };
    const categoriesJson = jsonLiteral(categoryRows, "categories_json");
    const recipesJson = jsonLiteral(recipeRows, "recipes_json");
    const ingredientsJson = jsonLiteral(ingredientRows, "ingredients_json");
    const stepsJson = jsonLiteral(stepRows, "steps_json");

    await client.query(`
      BEGIN;

      CREATE TEMP TABLE tmp_recipe_categories ON COMMIT DROP AS
      SELECT * FROM json_to_recordset(${categoriesJson}::json)
        AS x(slug text, name text, sort_order integer);

      CREATE TEMP TABLE tmp_recipes ON COMMIT DROP AS
      SELECT * FROM json_to_recordset(${recipesJson}::json) AS x(
        slug text, title text, short_description text, description text, category_slug text,
        cover_image_url text, sort_order integer, yield_quantity numeric, yield_unit text,
        recipe_kind text, visibility text, serving_size_ml numeric,
        content_source_key text, operational_notes jsonb
      );

      CREATE TEMP TABLE tmp_recipe_ingredients ON COMMIT DROP AS
      SELECT * FROM json_to_recordset(${ingredientsJson}::json) AS x(
        recipe_slug text, product_name text, quantity numeric, unit text, note text,
        optional boolean, sort_order integer, source_type text, source_recipe_slug text,
        catalog_key text, catalog_variant_id uuid
      );

      CREATE TEMP TABLE tmp_recipe_steps ON COMMIT DROP AS
      SELECT * FROM json_to_recordset(${stepsJson}::json) AS x(
        recipe_slug text, step_no integer, title text, content text, sort_order integer
      );

      INSERT INTO recipe_categories(slug, name, sort_order, is_active)
      SELECT slug, name, sort_order, true FROM tmp_recipe_categories
      ON CONFLICT(slug) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        updated_at = now();

      INSERT INTO recipes(
        slug, title, short_description, description, recipe_category_id,
        cover_image_url, status, sort_order, yield_quantity, yield_unit,
        recipe_kind, visibility, serving_size_ml, content_source_key, operational_notes
      )
      SELECT
        t.slug, t.title, t.short_description, t.description, c.id,
        t.cover_image_url, 'draft', t.sort_order, t.yield_quantity, t.yield_unit,
        t.recipe_kind, t.visibility, t.serving_size_ml, t.content_source_key, t.operational_notes
      FROM tmp_recipes t
      JOIN recipe_categories c ON c.slug = t.category_slug
      ON CONFLICT(slug) DO UPDATE SET
        title = EXCLUDED.title,
        short_description = EXCLUDED.short_description,
        description = EXCLUDED.description,
        recipe_category_id = EXCLUDED.recipe_category_id,
        cover_image_url = COALESCE(EXCLUDED.cover_image_url, recipes.cover_image_url),
        sort_order = EXCLUDED.sort_order,
        yield_quantity = EXCLUDED.yield_quantity,
        yield_unit = EXCLUDED.yield_unit,
        recipe_kind = EXCLUDED.recipe_kind,
        visibility = EXCLUDED.visibility,
        serving_size_ml = EXCLUDED.serving_size_ml,
        content_source_key = EXCLUDED.content_source_key,
        operational_notes = EXCLUDED.operational_notes,
        updated_at = now();

      DELETE FROM recipe_ingredients ri
      USING recipes r, tmp_recipes t
      WHERE ri.recipe_id = r.id AND r.slug = t.slug;

      DELETE FROM recipe_steps rs
      USING recipes r, tmp_recipes t
      WHERE rs.recipe_id = r.id AND r.slug = t.slug;

      INSERT INTO recipe_ingredients(
        recipe_id, product_name, quantity, unit, note, optional, sort_order,
        catalog_product_id, catalog_variant_id, catalog_snapshot,
        source_type, source_recipe_id, source_recipe_slug, catalog_key
      )
      SELECT
        r.id,
        i.product_name,
        i.quantity,
        i.unit,
        i.note,
        i.optional,
        i.sort_order,
        v.product_id,
        v.id,
        CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
          'variantId', v.id::text,
          'productId', v.product_id::text,
          'sku', v.sku,
          'productName', p.name,
          'variantName', v.name
        ) END,
        i.source_type,
        sr.id,
        i.source_recipe_slug,
        i.catalog_key
      FROM tmp_recipe_ingredients i
      JOIN recipes r ON r.slug = i.recipe_slug
      LEFT JOIN recipes sr ON sr.slug = i.source_recipe_slug
      LEFT JOIN catalog_variants v ON v.id = i.catalog_variant_id
      LEFT JOIN catalog_products p ON p.id = v.product_id;

      INSERT INTO recipe_steps(
        recipe_id, step_no, title, content, instruction, sort_order, provenance_source
      )
      SELECT r.id, s.step_no, s.title, s.content, s.content, s.sort_order, 'human'
      FROM tmp_recipe_steps s
      JOIN recipes r ON r.slug = s.recipe_slug;

      COMMIT;
    `);
    console.log(`Imported ${recipesDoc.recipes.length} recipes.`);

  }
} catch (e) { await client.query("ROLLBACK"); throw e; }
finally { client.release(); await pool.end(); }
