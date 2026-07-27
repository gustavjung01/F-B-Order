import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assert,
  buildOptions,
  normalizeCommercial,
  readJson,
} from "./catalog-remap-batch-common.mjs";
import {
  csv,
  normalizeCorrectionManifest,
  validateCorrectionCommercial,
} from "./sinh-to-mut-correction-common.mjs";
import {
  applyTask,
  rollbackTask,
} from "./sinh-to-mut-correction-apply.mjs";
import { buildCorrectionPlan } from "./sinh-to-mut-correction-state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argument = (name, fallback = null) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const CORRECTION_TOKEN = "BEPSI_SINH_TO_MUT_CORRECTION_25";

function selfTest() {
  const next = buildOptions(
    { size: "1300 g", type: "dau", flavor: "dau", image_hint: "keep" },
    { attributeModelVersion: 1, productType: "mut", flavor: "dau", measureKind: "mass", sellUnit: "chai", packageQuantity: 12, packageUnit: "thùng", netQuantity: 1300, netUnit: "g" },
  );
  assert(next.type === "mut" && next.flavor === "dau" && next.measure_kind === "mass" && next.weight === "1300 g", "Attribute correction self-test failed.");
  assert(next.image_hint === "keep", "Unrelated options were not preserved.");
  console.log(JSON.stringify({ status: "SINH_TO_MUT_CORRECTION_SELF_TEST_PASS", next }, null, 2));
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const manifestPath = path.resolve(process.cwd(), argument("manifest", "data/catalog-remap/sinh-to-mut-correction-01.json"));
const commercialArg = argument("commercial-file");
assert(commercialArg, "--commercial-file is required.", "CATALOG_CORRECTION_COMMERCIAL_REQUIRED");
const commercialPath = path.resolve(process.cwd(), commercialArg);
const outputJsonPath = path.resolve(process.cwd(), argument("output-json", "artifacts/catalog-remap/sinh-to-mut-correction-01-dry-run.json"));
const outputCsvPath = path.resolve(process.cwd(), argument("output-csv", "artifacts/catalog-remap/sinh-to-mut-correction-01-dry-run.csv"));
const applyMode = process.argv.includes("--apply");
const rollbackIds = (argument("rollback") || "").split(",").map((value) => value.trim()).filter(Boolean);
const allowRemoteApply = process.argv.includes("--allow-remote-apply");
const confirmation = argument("confirm-production") || "";
assert(!(applyMode && rollbackIds.length), "Choose apply or rollback, not both.", "CATALOG_CORRECTION_MODE_INVALID");
const manifest = normalizeCorrectionManifest(readJson(manifestPath, "Correction manifest"));
const payload = normalizeCommercial(readJson(commercialPath, "Correction commercial payload"));
validateCorrectionCommercial(manifest, payload);

const dotenv = (await import("dotenv")).default;
const pg = (await import("pg")).default;
for (const envPath of [path.resolve(process.cwd(), ".env"), path.resolve(here, "../.env"), path.resolve(here, "../.env.local")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured.", "CATALOG_CORRECTION_DATABASE_URL_REQUIRED");
const targetUrl = new URL(connectionString);
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname);
if (applyMode || rollbackIds.length) {
  assert(localConnection || allowRemoteApply, "Remote writes require --allow-remote-apply.", "CATALOG_CORRECTION_REMOTE_WRITE_REFUSED");
  assert(confirmation === CORRECTION_TOKEN, `Production write requires --confirm-production=${CORRECTION_TOKEN}.`, "CATALOG_CORRECTION_CONFIRMATION_REQUIRED");
}
const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: localConnection ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();

try {
  if (rollbackIds.length) {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='300s'");
    const results = [];
    for (const id of rollbackIds) results.push(await rollbackTask(client, id));
    await client.query("COMMIT");
    const report = {
      status: "SINH_TO_MUT_CORRECTION_ROLLBACK_PASS",
      applied: false,
      target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") },
      results,
      rollbackBatchIds: results.map((item) => item.batchId).reverse(),
      note: "Correction rollback finished without touching R2 or other services.",
    };
    fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } else if (applyMode) {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='300s'");
    const result = await applyTask(client, manifest, payload);
    await client.query("COMMIT");
    const report = {
      status: "SINH_TO_MUT_CORRECTION_APPLY_PASS",
      applied: true,
      target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") },
      ...result,
      note: "Correction apply finished. No R2 write occurred.",
    };
    fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } else {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='120s'");
    const plan = await buildCorrectionPlan(client, manifest, payload);
    await client.query("ROLLBACK");

    const report = {
      status: plan.pass ? "SINH_TO_MUT_CORRECTION_DRY_RUN_PASS" : "SINH_TO_MUT_CORRECTION_DRY_RUN_BLOCKED",
      applied: false,
      canApply: plan.pass,
      target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") },
      manifest: { path: manifestPath, taskId: manifest.taskId, groupKey: manifest.groupKey },
      commercial: { path: commercialPath, payloadHash: payload.payloadHash },
      summary: plan.summary,
      parents: plan.parents.map((parent) => ({
        detailGroup: parent.detailGroup, productKey: parent.productKey, productId: parent.current?.id || null,
        pass: parent.pass, blockers: parent.blockers, metadataChanges: parent.metadataChanges,
      })),
      rows: plan.rows.map((row) => ({
        rowNo: row.expected.rowNo, action: row.expected.action, legacySku: row.expected.legacySku || null,
        canonicalSku: row.expected.canonicalSku, pass: row.pass, blockers: row.blockers,
        variantId: row.current?.id || null, sourceProductId: row.current?.productId || null,
        targetProductId: row.parent?.current?.id || null, preserveVariantId: row.preserveVariantId,
        preserveImageObjectKey: row.preserveImageObjectKey, imageObjectKey: row.current?.imageObjectKey || null,
        aliasVerified: Boolean(row.alias), changes: row.changes, afterOptions: row.afterOptions, references: row.references,
      })),
      note: "Read-only correction dry-run. Existing canonical SKUs, legacy alias trace, variant IDs, recipe links, and image object keys were inspected. No database, service, migration, or R2 write occurred.",
    };

    fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(outputCsvPath), { recursive: true });
    fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const headers = ["rowNo","action","legacySku","canonicalSku","pass","variantId","sourceProductId","targetProductId","preserveVariantId","preserveImageObjectKey","imageObjectKey","aliasVerified","blockers"];
    const flat = report.rows.map((row) => ({ ...row, blockers: row.blockers.join(" | ") }));
    fs.writeFileSync(outputCsvPath, `${[headers.join(","), ...flat.map((row) => headers.map((header) => csv(row[header])).join(","))].join("\n")}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
    if (!plan.pass) process.exitCode = 2;
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({ status: "FAILED", code: error?.code || "CATALOG_CORRECTION_FAILED", message: error instanceof Error ? error.message : String(error), details: error?.details }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
