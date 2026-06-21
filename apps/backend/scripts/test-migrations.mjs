import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";
import { MIGRATION_FILES, MIGRATION_LOCK_KEYS } from "./migration-plan.mjs";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "../../..");
const runnerPath = path.join(__dirname, "run-migrations.mjs");
const verifierPath = path.join(__dirname, "verify-core-order-contract.mjs");
const fixturePath = path.join(repoRoot, "db/fixtures/legacy-production.sql");
const adminConnectionString = process.env.TEST_DATABASE_URL;

if (!adminConnectionString) {
  console.error("TEST_DATABASE_URL is required for migration integration tests.");
  process.exit(1);
}

function databaseUrl(databaseName) {
  const url = new URL(adminConnectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function uniqueDatabaseName(label) {
  const suffix = `${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  return `bepsi_${label}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}

async function runNodeScript(scriptPath, connectionString, args = [], { expectFailure = false } = {}) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      BEPSI_DATABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  if (expectFailure) {
    assert.notEqual(exitCode, 0, `Expected ${path.basename(scriptPath)} to fail`);
  } else {
    assert.equal(exitCode, 0, `${path.basename(scriptPath)} failed\n${stderr}`);
  }

  return { exitCode, stdout, stderr };
}

async function withDatabase(label, callback) {
  const databaseName = uniqueDatabaseName(label);
  const adminPool = new Pool({ connectionString: adminConnectionString, max: 1 });
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);

  try {
    await callback(databaseUrl(databaseName));
  } finally {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await adminPool.end();
  }
}

async function queryDatabase(connectionString, sql, params = []) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    return await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

async function migrateFreshDatabase(connectionString) {
  await runNodeScript(runnerPath, connectionString);
  await runNodeScript(verifierPath, connectionString);
}

async function testFreshAndRerun() {
  await withDatabase("fresh", async (connectionString) => {
    console.log("\n[TEST] fresh PostgreSQL database");
    await migrateFreshDatabase(connectionString);

    const firstLedger = await queryDatabase(
      connectionString,
      `SELECT filename, checksum, applied_at, execution_time_ms, execution_mode
       FROM schema_migrations ORDER BY filename`,
    );
    assert.equal(firstLedger.rowCount, MIGRATION_FILES.length);
    assert.ok(firstLedger.rows.every((row) => row.execution_mode === "executed"));

    console.log("\n[TEST] second migration run is a no-op");
    await runNodeScript(runnerPath, connectionString);
    const secondLedger = await queryDatabase(
      connectionString,
      `SELECT filename, checksum, applied_at, execution_time_ms, execution_mode
       FROM schema_migrations ORDER BY filename`,
    );
    assert.deepEqual(secondLedger.rows, firstLedger.rows);
  });
}

async function testAdvisoryLock() {
  await withDatabase("lock", async (connectionString) => {
    console.log("\n[TEST] advisory lock serializes migration runners");
    await migrateFreshDatabase(connectionString);

    const lockPool = new Pool({ connectionString, max: 1 });
    const lockClient = await lockPool.connect();
    const [lockKeyA, lockKeyB] = MIGRATION_LOCK_KEYS;
    await lockClient.query("SELECT pg_advisory_lock($1, $2)", [lockKeyA, lockKeyB]);

    const blockedRunner = spawn(process.execPath, [runnerPath], {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: connectionString, BEPSI_DATABASE_URL: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let blockedOutput = "";
    blockedRunner.stdout.on("data", (chunk) => {
      blockedOutput += chunk.toString();
    });
    blockedRunner.stderr.on("data", (chunk) => {
      blockedOutput += chunk.toString();
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(blockedRunner.exitCode, null, "Second runner did not wait for the advisory lock");
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock($1, $2)", [lockKeyA, lockKeyB]);
      lockClient.release();
      await lockPool.end();
    }

    const blockedExitCode = await new Promise((resolve, reject) => {
      blockedRunner.once("error", reject);
      blockedRunner.once("close", resolve);
    });
    assert.equal(blockedExitCode, 0, blockedOutput);
  });
}

async function testChecksumMismatch() {
  await withDatabase("checksum", async (connectionString) => {
    console.log("\n[TEST] checksum mismatch is rejected");
    await migrateFreshDatabase(connectionString);
    await queryDatabase(
      connectionString,
      `UPDATE schema_migrations
       SET checksum = $2
       WHERE filename = $1`,
      [MIGRATION_FILES[0], "0".repeat(64)],
    );
    const mismatch = await runNodeScript(runnerPath, connectionString, [], { expectFailure: true });
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /Checksum mismatch/);
  });
}

async function testLegacyFixture() {
  await withDatabase("legacy", async (connectionString) => {
    console.log("\n[TEST] audited legacy Heroku fixture");
    const fixtureSql = fs.readFileSync(fixturePath, "utf8");
    await queryDatabase(connectionString, fixtureSql);

    const before = await queryDatabase(
      connectionString,
      `SELECT
         (SELECT count(*)::int FROM categories) AS categories,
         (SELECT count(*)::int FROM products) AS products`,
    );
    assert.equal(before.rows[0].categories, 29);
    assert.equal(before.rows[0].products, 29);

    await runNodeScript(runnerPath, connectionString);
    await runNodeScript(verifierPath, connectionString);

    const contract = await queryDatabase(
      connectionString,
      `SELECT
         (SELECT data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'approval_status') AS approval_type,
         (SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_id') AS product_id_nullable,
         (SELECT count(*)::int FROM categories) AS categories,
         (SELECT count(*)::int FROM products) AS products,
         (SELECT count(*)::int FROM schema_migrations) AS migrations,
         (SELECT name FROM customers WHERE clerk_user_id = 'legacy-clerk-user') AS customer_name`,
    );

    assert.equal(contract.rows[0].approval_type, "text");
    assert.equal(contract.rows[0].product_id_nullable, "YES");
    assert.equal(contract.rows[0].categories, 29);
    assert.equal(contract.rows[0].products, 29);
    assert.equal(contract.rows[0].migrations, MIGRATION_FILES.length);
    assert.equal(contract.rows[0].customer_name, "Legacy Shop");
  });
}

async function testExistingBaseline() {
  await withDatabase("baseline", async (connectionString) => {
    console.log("\n[TEST] adopt an already-migrated production baseline");
    await migrateFreshDatabase(connectionString);
    await queryDatabase(connectionString, "DROP TABLE schema_migrations");
    await runNodeScript(runnerPath, connectionString, ["--baseline-existing"]);

    const ledger = await queryDatabase(
      connectionString,
      `SELECT filename, execution_time_ms, execution_mode
       FROM schema_migrations ORDER BY filename`,
    );
    assert.equal(ledger.rowCount, MIGRATION_FILES.length);
    assert.ok(ledger.rows.every((row) => row.execution_mode === "baselined"));
    assert.ok(ledger.rows.every((row) => row.execution_time_ms === 0));

    await runNodeScript(runnerPath, connectionString);
  });
}

const scenarios = new Map([
  ["fresh-rerun", testFreshAndRerun],
  ["legacy", testLegacyFixture],
  ["baseline", testExistingBaseline],
  ["lock", testAdvisoryLock],
  ["checksum", testChecksumMismatch],
]);

const requestedScenarios = process.argv.slice(2).filter((argument) => argument !== "--");
const selectedScenarios = requestedScenarios.length > 0 ? requestedScenarios : [...scenarios.keys()];

try {
  for (const scenarioName of selectedScenarios) {
    const scenario = scenarios.get(scenarioName);
    if (!scenario) {
      throw new Error(`Unknown migration test scenario: ${scenarioName}`);
    }
    await scenario();
    console.log(`\nPASS: ${scenarioName}`);
  }
  console.log("\nMigration integration tests passed.");
} catch (error) {
  console.error("\nMigration integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
