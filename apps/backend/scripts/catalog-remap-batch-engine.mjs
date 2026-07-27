import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot, arg, clean, assert, readJson, normalizeManifest, normalizeCommercial, validateManifestCommercial, buildOptions } from "./catalog-remap-batch-common.mjs";
import { buildPlan, selectParentTarget } from "./catalog-remap-batch-state.mjs";
import { applyTask, rollbackTask } from "./catalog-remap-batch-apply.mjs";
import { verifyAppliedTasks, loadTaskConfig } from "./catalog-remap-batch-verify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function selfTest() {
  const countOnly = buildOptions({ size: "10 g", weight: "10 g", color: "x" }, { measureMode: "count_only", sellUnit: "hộp", packageQuantity: 30, packageUnit: "thùng", type: "đào" });
  assert(!("size" in countOnly) && !("weight" in countOnly), "COUNT_ONLY options retained measured fields.");
  assert(countOnly.package === "30 hộp / thùng" && countOnly.sell_unit === "hộp", "COUNT_ONLY options are invalid.");
  const measured = buildOptions({}, { measureMode: "measured", sellUnit: "bịch", packageQuantity: 20, packageUnit: "thùng", netQuantity: 500, netUnit: "g" });
  assert(measured.size === "500 g", "Measured options are invalid.");
  const sharedParentSelection = selectParentTarget({
    existing: null,
    survivorProduct: { id: "shared-source-parent" },
    strategy: "merge_keep_first_product",
    claimedTargetProductIds: new Set(["shared-source-parent"]),
  });
  assert(!sharedParentSelection.targetProduct && sharedParentSelection.createProduct && sharedParentSelection.sharedSourceCollision, "Shared source parent was not split into a distinct target parent.");
  const validated = [];
  const configArg = arg("test-config");
  if (configArg) {
    const configPath = path.resolve(configArg);
    const base = path.dirname(configPath);
    const config = readJson(configPath, "Self-test config");
    for (const task of config.tasks || []) {
      const resolveTestPath = (value) => {
        const repoCandidate = path.resolve(repoRoot, value);
        return fs.existsSync(repoCandidate) ? repoCandidate : path.resolve(base, value);
      };
      const manifest = normalizeManifest(readJson(resolveTestPath(task.manifest), "Self-test manifest"));
      const payload = normalizeCommercial(readJson(resolveTestPath(task.commercialFile), "Self-test commercial payload"));
      validateManifestCommercial(manifest, payload);
      validated.push({ taskId: manifest.taskId, rows: manifest.rows.length, manifestHash: manifest.manifestHash, payloadHash: payload.payloadHash, payloadHashProfile: payload.hashProfile });
    }
  }
  console.log(JSON.stringify({ status: "SELF_TEST_PASS", countOnly, measured, sharedParentSelection, validated }, null, 2));
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const dotenv = (await import("dotenv")).default;
const pg = (await import("pg")).default;
const { Pool } = pg;
for (const p of [path.join(repoRoot, ".env"), path.resolve(here, "../.env"), path.resolve(here, "../.env.local")]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

const rollbackIds = (arg("rollback") || "").split(",").map(clean).filter(Boolean);
const apply = process.argv.includes("--apply");
assert(!(apply && rollbackIds.length), "Choose apply or rollback, not both.", "CATALOG_REMAP_MODE_INVALID");
const allowRemoteApply = process.argv.includes("--allow-remote-apply");
const confirmProduction = arg("confirm-production");
const configPath = path.resolve(repoRoot, arg("config", "data/catalog-remap/tea-production-plan.json"));
const outputPath = path.resolve(repoRoot, arg("output-json", "artifacts/catalog-remap/tea-production-result.json"));
const config = readJson(configPath, "Task configuration");
const expectedConfirmation = config.productionConfirmation || (config.planId === "TEA-PRODUCTION-48" ? "BEPSI_TEA_48" : undefined);
const allowedTaskIds = new Set((config.tasks || []).map((task) => clean(task.taskId)).filter(Boolean));
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured.", "CATALOG_REMAP_DATABASE_URL_REQUIRED");
const targetUrl = new URL(connectionString);
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname);
if (apply || rollbackIds.length) {
  assert(localConnection || allowRemoteApply, "Remote writes require --allow-remote-apply.", "CATALOG_REMAP_REMOTE_WRITE_REFUSED");
  assert(expectedConfirmation, "Production plan is missing productionConfirmation.", "CATALOG_REMAP_PRODUCTION_CONFIRMATION_MISSING");
  assert(confirmProduction === expectedConfirmation, `Production write requires --confirm-production=${expectedConfirmation}.`, "CATALOG_REMAP_PRODUCTION_CONFIRMATION_REQUIRED");
}
if (rollbackIds.length) assert(allowedTaskIds.size > 0, "Rollback plan has no task scope.", "CATALOG_REMAP_ROLLBACK_SCOPE_MISSING");
const pool = new Pool({ connectionString, ssl: localConnection ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();
try {
  if (rollbackIds.length) {
    for (const id of rollbackIds) assert(/^[0-9a-f-]{36}$/i.test(id), "Rollback batch ID is invalid.", "CATALOG_REMAP_ROLLBACK_ID_INVALID");
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='180s'");
    const scope = await client.query(`SELECT id::text,task_id AS "taskId" FROM catalog_group_remap_batches WHERE id=ANY($1::uuid[])`, [rollbackIds]);
    assert(scope.rows.length === rollbackIds.length, "One or more rollback batches do not exist.", "CATALOG_REMAP_ROLLBACK_BATCH_MISSING");
    const outOfScope = scope.rows.filter((row) => !allowedTaskIds.has(clean(row.taskId)));
    assert(outOfScope.length === 0, "Rollback batch is outside the selected production plan.", "CATALOG_REMAP_ROLLBACK_SCOPE_MISMATCH", outOfScope);
    const results = [];
    for (const id of rollbackIds) results.push(await rollbackTask(client, id));
    await client.query("COMMIT");
    const report = { status: "CATALOG_REMAP_ROLLBACK_PASS", applied: false, target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") }, results };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
  } else {
    const configs = loadTaskConfig(configPath);
    if (!apply) {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout='120s'");
      const taskReports = [];
      for (const config of configs) {
        const plan = await buildPlan(client, config.manifest, config.payload);
        taskReports.push({ taskId: config.manifest.taskId, manifestHash: config.manifest.manifestHash, payloadHash: config.payload.payloadHash, status: plan.pass ? "BATCH_DRY_RUN_PASS" : "BATCH_DRY_RUN_BLOCKED", summary: plan.summary, rows: plan.rows.map((row) => ({ rowNo: row.expected.rowNo, action: row.expected.action, legacySku: row.expected.legacySku || null, canonicalSku: row.expected.canonicalSku, pass: row.pass, blockers: row.blockers, afterOptions: buildOptions(row.current?.options || {}, row.expected) })) });
      }
      await client.query("ROLLBACK");
      const pass = taskReports.every((report) => report.status === "BATCH_DRY_RUN_PASS");
      const report = { status: pass ? "TEA_PRODUCTION_DRY_RUN_PASS" : "TEA_PRODUCTION_DRY_RUN_BLOCKED", applied: false, target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") }, taskReports, note: "Read-only. No catalog, migration, service, or R2 write was performed." };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
      if (!pass) process.exitCode = 2;
    } else {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='300s'");
      const results = [];
      for (const config of configs) results.push(await applyTask(client, config.manifest, config.payload));
      const verification = await verifyAppliedTasks(client, configs);
      await client.query("COMMIT");
      const report = { status: "TEA_PRODUCTION_APPLY_PASS", applied: true, target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") }, results, verification, rollbackBatchIds: results.map((item) => item.batchId).reverse() };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
    }
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({ status: "FAILED", code: error?.code || "CATALOG_REMAP_BATCH_FAILED", message: error instanceof Error ? error.message : String(error), details: error?.details }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
