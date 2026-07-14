import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { MIGRATION_FILES } from "./migration-plan.mjs";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const adminConnectionString = process.env.TEST_DATABASE_URL;

if (!adminConnectionString) {
  console.error("TEST_DATABASE_URL is required for the Recipe UTF-8 migration test.");
  process.exit(1);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseUrl(databaseName) {
  const url = new URL(adminConnectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function readMigration(filename) {
  return fs
    .readFileSync(path.join(repoRoot, filename), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
}

const databaseName = `bepsi_recipe_utf8_${process.pid}_${Date.now()}`.toLowerCase();
const adminPool = new Pool({ connectionString: adminConnectionString, max: 1 });

try {
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  const connectionString = databaseUrl(databaseName);
  const pool = new Pool({ connectionString, max: 1 });

  try {
    const repairFilename = "db/migrations/016_recipe_title_utf8_repair.sql";
    const repairIndex = MIGRATION_FILES.indexOf(repairFilename);
    assert.ok(repairIndex > 0, "Recipe UTF-8 repair migration must be present in the migration plan.");

    for (const filename of MIGRATION_FILES.slice(0, repairIndex)) {
      await pool.query(readMigration(filename));
    }

    const recipeResult = await pool.query(
      `INSERT INTO recipes (slug, title, status)
       VALUES ('recipe-utf8-fixture', 'Tr� S?a H?ng Tr�', 'active')
       RETURNING id::text`,
    );
    const recipeId = recipeResult.rows[0].id;

    const versionResult = await pool.query(
      `INSERT INTO recipe_versions (recipe_id, version_no, workflow_status, snapshot)
       VALUES ($1, 1, 'published', jsonb_build_object('slug', 'recipe-utf8-fixture', 'title', 'Tr� S?a H?ng Tr�'))
       RETURNING id::text`,
      [recipeId],
    );
    const originalVersionId = versionResult.rows[0].id;

    await pool.query(
      `UPDATE recipes
       SET current_version_id = $2, published_version_id = $2
       WHERE id = $1`,
      [recipeId, originalVersionId],
    );

    await pool.query(`
      CREATE OR REPLACE FUNCTION test_reject_recipe_snapshot_update()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
          RAISE EXCEPTION 'Recipe version snapshots are immutable';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER test_recipe_snapshot_immutable
      BEFORE UPDATE ON recipe_versions
      FOR EACH ROW EXECUTE FUNCTION test_reject_recipe_snapshot_update();
    `);

    await pool.query(readMigration(repairFilename));

    const repairedRecipe = await pool.query(
      `SELECT title, current_version_id::text AS current_version_id, published_version_id::text AS published_version_id
       FROM recipes WHERE id = $1`,
      [recipeId],
    );
    assert.equal(repairedRecipe.rows[0].title, "Trà Sữa Hùng Trà");
    assert.notEqual(repairedRecipe.rows[0].current_version_id, originalVersionId);
    assert.equal(repairedRecipe.rows[0].published_version_id, repairedRecipe.rows[0].current_version_id);

    const versions = await pool.query(
      `SELECT id::text, version_no, workflow_status, snapshot ->> 'title' AS title
       FROM recipe_versions
       WHERE recipe_id = $1
       ORDER BY version_no`,
      [recipeId],
    );
    assert.equal(versions.rowCount, 2);
    assert.deepEqual(versions.rows.map((row) => row.title), ["Tr� S?a H?ng Tr�", "Trà Sữa Hùng Trà"]);
    assert.equal(versions.rows[0].id, originalVersionId);
    assert.equal(versions.rows[1].workflow_status, "published");
    assert.equal(versions.rows[1].id, repairedRecipe.rows[0].current_version_id);

    console.log("Recipe UTF-8 migration preserves immutable snapshots and advances pointers.");
  } finally {
    await pool.end();
  }
} finally {
  await adminPool.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [databaseName],
  ).catch(() => undefined);
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`).catch(() => undefined);
  await adminPool.end();
}
