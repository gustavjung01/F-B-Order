import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(backendRoot, ".env"),
  path.join(backendRoot, ".env.local"),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

const requiredTables = [
  "recipe_categories",
  "recipes",
  "recipe_versions",
  "recipe_ingredients",
  "recipe_steps",
  "recipe_mistakes",
  "recipe_business_tips",
  "recipe_seasonal_rules",
  "recipe_tags",
  "recipe_tag_links",
  "recipe_product_links",
];

const requiredColumns = new Map([
  [
    "recipes",
    [
      "aliases",
      "visibility",
      "difficulty",
      "prep_minutes",
      "cook_minutes",
      "yield_quantity",
      "yield_unit",
      "current_version",
      "created_by_staff_id",
      "approved_by_staff_id",
      "published_at",
      "archived_at",
      "provenance_source",
      // Legacy columns deliberately retained during the additive upgrade.
      "estimated_cost",
      "suggested_price",
    ],
  ],
  [
    "recipe_ingredients",
    [
      "name",
      "source_type",
      "catalog_product_id",
      "catalog_variant_id",
      "default_selections",
      "selection_key",
      "usage_quantity",
      "usage_unit",
      "package_content_quantity",
      "package_content_unit",
      "waste_percent",
      "usable_yield_percent",
      "is_optional",
      "is_cart_ready",
      "catalog_product_name_snapshot",
      "catalog_variant_name_snapshot",
      "sku_snapshot",
      "specification_snapshot",
      "selection_key_snapshot",
      "provenance_source",
      // Legacy bridge columns deliberately retained.
      "product_id",
      "product_name",
      "quantity",
      "unit",
      "optional",
    ],
  ],
  [
    "recipe_steps",
    [
      "instruction",
      "duration_seconds",
      "temperature_celsius",
      "success_marker",
      "warning",
      "media_url",
      "sort_order",
      "provenance_source",
      // Legacy bridge columns deliberately retained.
      "step_no",
      "content",
      "image_url",
    ],
  ],
  ["recipe_versions", ["recipe_id", "version_number", "snapshot", "source", "created_by_staff_id"]],
  ["recipe_mistakes", ["recipe_id", "symptom", "likely_causes", "prevention", "severity", "sort_order"]],
  ["recipe_business_tips", ["recipe_id", "recommendation", "sort_order"]],
  ["recipe_seasonal_rules", ["recipe_id", "rule_type", "regions", "priority"]],
  ["recipe_product_links", ["recipe_id", "catalog_product_id", "catalog_variant_id", "selections", "selection_key"]],
]);

async function expectConstraintFailure(client, label, callback) {
  const savepoint = `verify_${label.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await callback();
    assert.fail(`Expected constraint failure: ${label}`);
  } catch (error) {
    assert.equal(error?.code, "23514", `${label} failed with unexpected SQLSTATE ${error?.code}`);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  }
}

async function expectImmutableFailure(client, callback) {
  await client.query("SAVEPOINT verify_immutable_version");
  try {
    await callback();
    assert.fail("Expected recipe version update to be rejected");
  } catch (error) {
    assert.match(String(error?.message || error), /immutable/i);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT verify_immutable_version");
  }
}

const client = await pool.connect();
try {
  const tableResult = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const presentTables = new Set(tableResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !presentTables.has(table));
  assert.deepEqual(missingTables, [], `Missing Recipe Core tables: ${missingTables.join(", ")}`);

  const columnResult = await client.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [[...requiredColumns.keys()]],
  );
  const columnsByTable = new Map();
  for (const row of columnResult.rows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
    columnsByTable.get(row.table_name).add(row.column_name);
  }

  const missingColumns = [];
  for (const [table, columns] of requiredColumns) {
    const present = columnsByTable.get(table) || new Set();
    for (const column of columns) {
      if (!present.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }
  assert.deepEqual(missingColumns, [], `Missing Recipe Core columns: ${missingColumns.join(", ")}`);

  const constraintNames = [
    "recipes_status_domain_check",
    "recipes_published_version_check",
    "recipes_archived_at_check",
    "recipe_ingredients_cart_ready_check",
    "recipe_ingredients_default_selections_shape_check",
    "recipe_steps_instruction_check",
    "recipe_versions_snapshot_shape_check",
    "recipe_mistakes_likely_causes_shape_check",
    "recipe_seasonal_rules_regions_shape_check",
    "recipe_product_links_selections_shape_check",
  ];
  const constraintResult = await client.query(
    `SELECT conname
     FROM pg_constraint
     WHERE conname = ANY($1::text[])`,
    [constraintNames],
  );
  const presentConstraints = new Set(constraintResult.rows.map((row) => row.conname));
  const missingConstraints = constraintNames.filter((name) => !presentConstraints.has(name));
  assert.deepEqual(missingConstraints, [], `Missing Recipe Core constraints: ${missingConstraints.join(", ")}`);

  const triggerResult = await client.query(
    `SELECT tgname
     FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgname = ANY($1::text[])`,
    [[
      "prevent_recipe_version_update_trigger",
      "set_recipe_ingredients_updated_at",
      "set_recipe_steps_updated_at",
      "set_recipe_mistakes_updated_at",
      "set_recipe_business_tips_updated_at",
      "set_recipe_seasonal_rules_updated_at",
      "set_recipe_product_links_updated_at",
    ]],
  );
  assert.equal(triggerResult.rowCount, 7, "Recipe Core triggers are incomplete");

  const fkResult = await client.query(
    `SELECT
       source.relname AS source_table,
       target.relname AS target_table,
       pg_get_constraintdef(constraint_row.oid) AS definition
     FROM pg_constraint constraint_row
     JOIN pg_class source ON source.oid = constraint_row.conrelid
     JOIN pg_class target ON target.oid = constraint_row.confrelid
     WHERE constraint_row.contype = 'f'
       AND source.relname IN ('recipe_ingredients', 'recipe_product_links')
       AND target.relname IN ('catalog_products', 'catalog_variants')`,
  );
  assert.equal(fkResult.rowCount, 4, "Expected four Recipe Core foreign keys into Catalog V2");
  assert.ok(fkResult.rows.every((row) => /ON DELETE RESTRICT/.test(row.definition)), "Catalog links must never cascade-delete recipe data");

  await client.query("BEGIN");
  try {
    const suffix = randomUUID();
    const recipeResult = await client.query(
      `INSERT INTO recipes (slug, title, short_description, status, visibility, yield_quantity, yield_unit)
       VALUES ($1, 'Recipe verifier', 'Temporary transaction-only recipe', 'draft', 'internal', 10, 'portion')
       RETURNING id::text, status, visibility, current_version`,
      [`verify-recipe-${suffix}`],
    );
    const recipe = recipeResult.rows[0];
    assert.deepEqual(
      { status: recipe.status, visibility: recipe.visibility, currentVersion: recipe.current_version },
      { status: "draft", visibility: "internal", currentVersion: 0 },
    );

    await client.query(
      `INSERT INTO recipe_ingredients (
         recipe_id, name, source_type, usage_quantity, usage_unit, is_optional, sort_order
       ) VALUES ($1, 'Nước lọc', 'external', 1000, 'ml', false, 1)`,
      [recipe.id],
    );

    await client.query(
      `INSERT INTO recipe_steps (
         recipe_id, step_no, content, instruction, sort_order
       ) VALUES ($1, 1, 'Pha nguyên liệu', 'Pha nguyên liệu', 1)`,
      [recipe.id],
    );

    await expectConstraintFailure(client, "cart_ready_without_catalog_identity", () => client.query(
      `INSERT INTO recipe_ingredients (
         recipe_id, name, source_type, usage_quantity, usage_unit,
         package_content_quantity, package_content_unit, is_cart_ready, sort_order
       ) VALUES ($1, 'Invalid catalog item', 'catalog', 10, 'ml', 700, 'ml', true, 2)`,
      [recipe.id],
    ));

    await expectConstraintFailure(client, "published_without_version", () => client.query(
      `UPDATE recipes
       SET status = 'published', published_at = now()
       WHERE id = $1`,
      [recipe.id],
    ));

    const versionResult = await client.query(
      `INSERT INTO recipe_versions (recipe_id, version_number, snapshot, source)
       VALUES ($1, 1, $2::jsonb, 'human')
       RETURNING id::text`,
      [recipe.id, JSON.stringify({ recipeId: recipe.id, versionNumber: 1, title: "Recipe verifier" })],
    );

    await client.query(
      `UPDATE recipes
       SET status = 'published', visibility = 'public', current_version = 1, published_at = now()
       WHERE id = $1`,
      [recipe.id],
    );

    await expectImmutableFailure(client, () => client.query(
      `UPDATE recipe_versions
       SET snapshot = snapshot || '{"changed":true}'::jsonb
       WHERE id = $1`,
      [versionResult.rows[0].id],
    ));
  } finally {
    await client.query("ROLLBACK");
  }

  console.log("Recipe Core schema contract verified.");
} catch (error) {
  console.error("Recipe Core schema verification failed.");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
