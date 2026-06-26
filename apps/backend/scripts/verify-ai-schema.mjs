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

let savepointCounter = 0;
async function expectDatabaseFailure(client, label, callback) {
  savepointCounter += 1;
  const savepoint = `ai_schema_check_${savepointCounter}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await callback();
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`${label} unexpectedly succeeded`);
}

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const columns = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ai_gateway_runs'`,
  );
  const columnNames = new Set(columns.rows.map((row) => row.column_name));
  for (const required of [
    "request_id",
    "schema_version",
    "use_case",
    "provider",
    "model",
    "actor_type",
    "status",
    "response_format",
    "request_fingerprint",
    "safety_metadata",
    "request_metadata",
    "started_at",
    "completed_at",
  ]) {
    if (!columnNames.has(required)) throw new Error(`Missing ai_gateway_runs.${required}`);
  }
  for (const forbidden of ["prompt", "input_text", "output_text", "request_body", "response_body"]) {
    if (columnNames.has(forbidden)) throw new Error(`Raw AI content column is forbidden: ${forbidden}`);
  }

  const indexes = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND tablename='ai_gateway_runs'`,
  );
  const indexNames = new Set(indexes.rows.map((row) => row.indexname));
  for (const required of [
    "ai_gateway_runs_request_id_key",
    "idx_ai_gateway_runs_created_at",
    "idx_ai_gateway_runs_use_case_status",
    "idx_ai_gateway_runs_actor",
  ]) {
    if (!indexNames.has(required)) throw new Error(`Missing AI gateway index ${required}`);
  }

  const inserted = await client.query(
    `INSERT INTO ai_gateway_runs (
       request_id,schema_version,use_case,provider,model,actor_type,actor_id,status,
       response_format,request_fingerprint,input_char_count,request_metadata
     ) VALUES (
       gen_random_uuid(),'1.0','operations_assistant','mock','mock-a1a','system',NULL,'started',
       'text',repeat('a',64),120,'{"correlationId":"a1a-contract"}'::jsonb
     ) RETURNING id,request_id`,
  );
  const runId = inserted.rows[0].id;

  await client.query(
    `UPDATE ai_gateway_runs
     SET status='succeeded',output_char_count=42,input_token_count=20,
         output_token_count=10,total_token_count=30,latency_ms=25,
         finish_reason='STOP',completed_at=now()
     WHERE id=$1`,
    [runId],
  );

  await expectDatabaseFailure(client, "staff actor requires actor_id", () =>
    client.query(
      `INSERT INTO ai_gateway_runs (
         request_id,schema_version,use_case,provider,model,actor_type,actor_id,status,
         response_format,request_fingerprint,input_char_count
       ) VALUES (
         gen_random_uuid(),'1.0','operations_assistant','mock','mock-a1a','staff',NULL,'started',
         'text',repeat('b',64),1
       )`,
    ),
  );

  await expectDatabaseFailure(client, "terminal status requires completed_at", () =>
    client.query(
      `INSERT INTO ai_gateway_runs (
         request_id,schema_version,use_case,provider,model,actor_type,actor_id,status,
         response_format,request_fingerprint,input_char_count
       ) VALUES (
         gen_random_uuid(),'1.0','recipe_draft','mock','mock-a1a','system',NULL,'failed',
         'json',repeat('c',64),1
       )`,
    ),
  );

  await expectDatabaseFailure(client, "fingerprint must be sha256 hex", () =>
    client.query(
      `INSERT INTO ai_gateway_runs (
         request_id,schema_version,use_case,provider,model,actor_type,actor_id,status,
         response_format,request_fingerprint,input_char_count
       ) VALUES (
         gen_random_uuid(),'1.0','catalog_enrichment','mock','mock-a1a','system',NULL,'started',
         'json','invalid',1
       )`,
    ),
  );

  await client.query("ROLLBACK");
  console.log("AI A1a database contract passed.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("AI A1a database contract failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
