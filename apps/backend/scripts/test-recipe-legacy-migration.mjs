import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "../../..");
const runnerPath = path.join(__dirname, "run-migrations.mjs");
const verifierPath = path.join(__dirname, "verify-recipe-core-schema.mjs");
const adminUrl = process.env.TEST_DATABASE_URL;

if (!adminUrl) {
  console.error("TEST_DATABASE_URL is required for legacy Recipe migration test.");
  process.exit(1);
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function databaseUrl(databaseName) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function runNode(scriptPath, connectionString) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      BEPSI_DATABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(exitCode, 0, output);
}

async function main() {
  const databaseName = `bepsi_recipe_legacy_${process.pid}_${Date.now()}`.toLowerCase();
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseUrl(databaseName);
  const db = new Pool({ connectionString, max: 1 });

  try {
    const productionFixture = fs.readFileSync(
      path.join(repoRoot, "db/fixtures/legacy-production.sql"),
      "utf8",
    );
    const recipeFixture = fs.readFileSync(
      path.join(repoRoot, "db/fixtures/legacy-recipe-name-only.sql"),
      "utf8",
    );
    await db.query(productionFixture);
    await db.query(recipeFixture);

    const before = await db.query(
      `SELECT
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='title') AS has_title,
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='name') AS has_legacy_name,
         COALESCE((SELECT is_nullable='NO' FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='name'), false) AS legacy_name_not_null,
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='recipe_category_id') AS has_recipe_category_id,
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='visibility') AS has_visibility`,
    );
    assert.deepEqual(before.rows[0], {
      has_title: false,
      has_legacy_name: true,
      legacy_name_not_null: true,
      has_recipe_category_id: false,
      has_visibility: false,
    });

    await runNode(runnerPath, connectionString);
    await runNode(verifierPath, connectionString);

    const after = await db.query(
      `SELECT
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='recipe_category_id') AS has_recipe_category_id,
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='visibility') AS has_visibility,
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='updated_at') AS has_updated_at,
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='product_id') AS has_product_id,
         EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipe_steps' AND column_name='image_url') AS has_image_url,
         (SELECT is_nullable FROM information_schema.columns
           WHERE table_schema='public' AND table_name='recipes' AND column_name='name') AS legacy_name_nullable`,
    );
    assert.deepEqual(after.rows[0], {
      has_recipe_category_id: true,
      has_visibility: true,
      has_updated_at: true,
      has_product_id: true,
      has_image_url: true,
      legacy_name_nullable: "YES",
    });

    const preserved = await db.query(
      `SELECT recipe.slug,recipe.title,recipe.name AS legacy_name,recipe.status,recipe.visibility,
        ingredient.name AS ingredient_name,ingredient.usage_quantity::text,
        ingredient.usage_unit,step.instruction
       FROM recipes recipe
       JOIN recipe_ingredients ingredient ON ingredient.recipe_id=recipe.id
       JOIN recipe_steps step ON step.recipe_id=recipe.id
       WHERE recipe.slug='legacy-tra-dao'`,
    );
    assert.equal(preserved.rowCount, 1);
    assert.equal(preserved.rows[0].title, "Legacy Trà đào");
    assert.equal(preserved.rows[0].legacy_name, "Legacy Trà đào");
    assert.equal(preserved.rows[0].status, "draft");
    assert.equal(preserved.rows[0].visibility, "internal");
    assert.equal(preserved.rows[0].ingredient_name, "Siro đào");
    assert.equal(preserved.rows[0].usage_quantity, "300.0000");
    assert.equal(preserved.rows[0].usage_unit, "ml");
    assert.equal(preserved.rows[0].instruction, "Khuấy đều nguyên liệu.");

    const titleOnlyInsert = await db.query(
      `INSERT INTO recipes(slug,title,status,visibility)
       VALUES('legacy-title-only','Title-only Recipe','draft','internal')
       RETURNING title,name`,
    );
    assert.deepEqual(titleOnlyInsert.rows[0], {
      title: "Title-only Recipe",
      name: "Title-only Recipe",
    });

    const nameOnlyInsert = await db.query(
      `INSERT INTO recipes(slug,name,status,visibility)
       VALUES('legacy-name-only','Name-only Recipe','draft','internal')
       RETURNING title,name`,
    );
    assert.deepEqual(nameOnlyInsert.rows[0], {
      title: "Name-only Recipe",
      name: "Name-only Recipe",
    });

    const titleUpdate = await db.query(
      `UPDATE recipes
       SET title='Updated through title'
       WHERE slug='legacy-title-only'
       RETURNING title,name`,
    );
    assert.deepEqual(titleUpdate.rows[0], {
      title: "Updated through title",
      name: "Updated through title",
    });

    const nameUpdate = await db.query(
      `UPDATE recipes
       SET name='Updated through name'
       WHERE slug='legacy-name-only'
       RETURNING title,name`,
    );
    assert.deepEqual(nameUpdate.rows[0], {
      title: "Updated through name",
      name: "Updated through name",
    });

    const ledger = await db.query(
      `SELECT filename FROM schema_migrations
       WHERE filename IN (
         'db/migrations/009a_recipe_legacy_bridge.sql',
         'db/migrations/010_recipe_core.sql',
         'db/migrations/010a_recipe_legacy_name_bridge.sql'
       )
       ORDER BY filename`,
    );
    assert.deepEqual(
      ledger.rows.map((row) => row.filename),
      [
        "db/migrations/009a_recipe_legacy_bridge.sql",
        "db/migrations/010_recipe_core.sql",
        "db/migrations/010a_recipe_legacy_name_bridge.sql",
      ],
    );

    console.log("Legacy Recipe database migration passed.");
  } finally {
    await db.end();
    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname=$1 AND pid<>pg_backend_pid()`,
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
