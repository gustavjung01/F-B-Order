import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const enginePath = path.join(here, "catalog-remap-batch-engine.mjs");
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const suffix = crypto.randomBytes(4).toString("hex");
const key = (value) => `${value}-${suffix}`;
const sku = (value) => `${value}-${suffix}`.toUpperCase();
const tempDir = path.join(repoRoot, "artifacts/catalog-remap", `engine-test-${suffix}`);
fs.mkdirSync(tempDir, { recursive: true });
const stableValue = (value) => Array.isArray(value) ? value.map(stableValue) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, stableValue(value[name])])) : value;
const stableHash = (value) => crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
const run = (args) => {
  const result = spawnSync("node", [enginePath, ...args], { cwd: repoRoot, env: process.env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Engine failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result;
};

const targetProductKey = key("ci-tea-target");
const sourceProductKey = key("ci-tea-source");
const survivorSku = sku("CI-SURV");
const legacySku = sku("CI-OLD");
const canonicalSku = sku("CI-NEW");
const createSku = sku("CI-BOX");
const targetVariantKey = key("ci-survivor-variant");
const sourceVariantKey = key("ci-source-variant");
let targetProductId;
let sourceProductId;
let survivorVariantId;
let sourceVariantId;
let recipeId;
let recipeIngredientId;
let batchId;

const pool = new Pool({ connectionString, ssl: ["localhost", "127.0.0.1", "::1"].includes(new URL(connectionString).hostname) ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  targetProductId = (await client.query(`INSERT INTO catalog_products (product_key,name,brand,industry,industry_key,catalog_group_key,subcategory,status) VALUES ($1,'CI Target','CI','Nguyên liệu trà sữa','nguyen-lieu-tra-sua','tra','CI','active') RETURNING id::text`, [targetProductKey])).rows[0].id;
  sourceProductId = (await client.query(`INSERT INTO catalog_products (product_key,name,brand,industry,industry_key,catalog_group_key,subcategory,status) VALUES ($1,'CI Source','CI','Nguyên liệu trà sữa','nguyen-lieu-tra-sua','tra','CI','active') RETURNING id::text`, [sourceProductKey])).rows[0].id;
  survivorVariantId = (await client.query(`INSERT INTO catalog_variants (product_id,variant_key,sku,name,options,price_mode,shop_price,status,is_active,is_public,is_orderable) VALUES ($1::uuid,$2,$3,'CI Survivor','{}'::jsonb,'fixed',10000,'active',true,true,true) RETURNING id::text`, [targetProductId,targetVariantKey,survivorSku])).rows[0].id;
  sourceVariantId = (await client.query(`INSERT INTO catalog_variants (product_id,variant_key,sku,name,options,price_mode,shop_price,status,is_active,is_public,is_orderable) VALUES ($1::uuid,$2,$3,'CI Old','{"size":"250 g","type":"legacy-wrong","flavor":"legacy-wrong"}'::jsonb,'fixed',11000,'active',true,true,true) RETURNING id::text`, [sourceProductId,sourceVariantKey,legacySku])).rows[0].id;
  await client.query(`INSERT INTO catalog_variant_packaging_specs (variant_id,sell_unit,package_quantity,package_unit,net_quantity,net_unit,measure_mode,source) VALUES ($1::uuid,'bịch',10,'thùng',250,'g','measured','ci-before')`, [sourceVariantId]);
  recipeId = (await client.query(`INSERT INTO recipes (slug,title,status) VALUES ($1,'CI Recipe','needs_review') RETURNING id::text`, [key("ci-recipe")])).rows[0].id;
  const snapshot = { variantId: sourceVariantId, productId: sourceProductId, sku: legacySku, productName: "CI Source", variantName: "CI Old" };
  recipeIngredientId = (await client.query(`INSERT INTO recipe_ingredients (recipe_id,product_name,quantity,unit,catalog_product_id,catalog_variant_id,catalog_snapshot) VALUES ($1::uuid,'CI Old',1,'g',$2::uuid,$3::uuid,$4::jsonb) RETURNING id::text`, [recipeId,sourceProductId,sourceVariantId,JSON.stringify(snapshot)])).rows[0].id;
  await client.query("COMMIT");

  const manifest = {
    schemaVersion: 2,
    attributeModelVersion: 1,
    taskId: key("CI-BATCH").toUpperCase(),
    groupKey: key("ci-batch"),
    industryKey: "nguyen-lieu-tra-sua",
    industryName: "Nguyên liệu trà sữa",
    catalogGroupKey: "tra",
    catalogGroupName: "Trà",
    reviewApproval: { status: "APPROVED", reviewedBy: "ci" },
    targetParents: {
      CI: { productKey: targetProductKey, name: "CI Target", brand: "CI", strategy: "attach_to_existing_or_create_parent", survivorLegacySku: survivorSku },
    },
    rows: [
      { rowNo: 1, action: "REMAP", legacySku, canonicalSku, name: "CI New", detailGroup: "CI", targetParentKey: targetProductKey, productType: "tra", flavor: "hong", measureKind: "mass", measureMode: "measured", sellUnit: "bịch", netQuantity: 500, netUnit: "g", packageQuantity: 20, packageUnit: "thùng" },
      { rowNo: 2, action: "CREATE_NEW", canonicalSku: createSku, name: "CI Box", detailGroup: "CI", targetParentKey: targetProductKey, productType: "tra-tui-loc", flavor: "", measureKind: "count", measureMode: "count_only", sellUnit: "hộp", netQuantity: null, netUnit: null, packageQuantity: 30, packageUnit: "thùng" },
    ],
  };
  const rows = [
    { sku: canonicalSku, action: "REMAP", legacySku, name: "CI New", group: "Trà", detailGroup: "CI", status: "ready", measureMode: "measured", sellUnit: "bịch", netQuantity: 500, netUnit: "g", packageQuantity: 20, packageUnit: "thùng", unitPrice: 12000, derivedPackagePrice: 240000 },
    { sku: createSku, action: "CREATE_NEW", legacySku: "", name: "CI Box", group: "Trà", detailGroup: "CI", status: "ready", measureMode: "count_only", sellUnit: "hộp", netQuantity: null, netUnit: null, packageQuantity: 30, packageUnit: "thùng", unitPrice: 13000, derivedPackagePrice: 390000 },
  ];
  const payload = { schemaVersion: 1, sourceKey: key("ci-commercial"), rows };
  payload.payloadHash = stableHash({ schemaVersion: payload.schemaVersion, sourceKey: payload.sourceKey, rows: payload.rows });
  const manifestPath = path.join(tempDir, "manifest.json");
  const payloadPath = path.join(tempDir, "payload.json");
  const configPath = path.join(tempDir, "config.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(configPath, `${JSON.stringify({ tasks: [{ manifest: path.relative(repoRoot, manifestPath).replaceAll("\\", "/"), commercialFile: path.relative(repoRoot, payloadPath).replaceAll("\\", "/") }] }, null, 2)}\n`);

  const dryPath = path.join(tempDir, "dry.json");
  run([`--config=${configPath}`, `--output-json=${dryPath}`]);
  const dry = JSON.parse(fs.readFileSync(dryPath, "utf8"));
  if (dry.status !== "TEA_PRODUCTION_DRY_RUN_PASS") throw new Error("Dry-run did not pass.");
  const remapAfterOptions = dry.taskReports[0].rows.find((row) => row.canonicalSku === canonicalSku)?.afterOptions;
  if (!remapAfterOptions || remapAfterOptions.type !== "tra" || remapAfterOptions.flavor !== "hong" || remapAfterOptions.measure_kind !== "mass" || remapAfterOptions.weight !== "500 g") throw new Error("Explicit product type, flavor, or mass options were not built correctly.");
  const countAfterOptions = dry.taskReports[0].rows.find((row) => row.canonicalSku === createSku)?.afterOptions;
  if (!countAfterOptions || countAfterOptions.type !== "tra-tui-loc" || countAfterOptions.measure_kind !== "count" || Object.prototype.hasOwnProperty.call(countAfterOptions, "flavor") || Object.prototype.hasOwnProperty.call(countAfterOptions, "size")) throw new Error("COUNT_ONLY explicit attributes are invalid.");

  const applyPath = path.join(tempDir, "apply.json");
  run([`--config=${configPath}`, "--apply", "--confirm-production=BEPSI_TEA_48", `--output-json=${applyPath}`]);
  const applied = JSON.parse(fs.readFileSync(applyPath, "utf8"));
  if (applied.status !== "TEA_PRODUCTION_APPLY_PASS" || applied.verification.canonicalVariantCount !== 2) throw new Error("Apply verification did not pass.");
  batchId = applied.results[0].batchId;

  const after = await client.query(`SELECT variant.id::text,variant.sku,variant.product_id::text AS product_id,variant.options,packaging.measure_mode,packaging.net_quantity::float8 AS net_quantity FROM catalog_variants variant LEFT JOIN catalog_variant_packaging_specs packaging ON packaging.variant_id=variant.id WHERE variant.sku=ANY($1::text[]) ORDER BY variant.sku`, [[canonicalSku,createSku]]);
  if (after.rows.length !== 2) throw new Error("Applied variants are missing.");
  const remapped = after.rows.find((row) => row.sku === canonicalSku);
  const created = after.rows.find((row) => row.sku === createSku);
  if (remapped.id !== sourceVariantId || remapped.product_id !== targetProductId || remapped.net_quantity !== 500) throw new Error("REMAP identity/state is invalid.");
  if (remapped.options.type !== "tra" || remapped.options.flavor !== "hong" || remapped.options.measure_kind !== "mass" || remapped.options.weight !== "500 g") throw new Error("REMAP explicit attributes were not persisted.");
  if (created.measure_mode !== "count_only" || created.options.type !== "tra-tui-loc" || created.options.measure_kind !== "count" || Object.prototype.hasOwnProperty.call(created.options || {}, "size") || Object.prototype.hasOwnProperty.call(created.options || {}, "flavor")) throw new Error("CREATE_NEW count-only state is invalid.");
  const recipeAfter = (await client.query(`SELECT catalog_product_id::text AS product_id,catalog_snapshot FROM recipe_ingredients WHERE id=$1::uuid`, [recipeIngredientId])).rows[0];
  if (recipeAfter.product_id !== targetProductId || recipeAfter.catalog_snapshot.sku !== canonicalSku) throw new Error("Recipe link was not updated atomically.");

  const rollbackPath = path.join(tempDir, "rollback.json");
  run([`--rollback=${batchId}`, "--confirm-production=BEPSI_TEA_48", `--output-json=${rollbackPath}`]);
  const rolled = JSON.parse(fs.readFileSync(rollbackPath, "utf8"));
  if (rolled.status !== "CATALOG_REMAP_ROLLBACK_PASS") throw new Error("Rollback did not pass.");
  const restored = (await client.query(`SELECT id::text,sku,product_id::text AS product_id,options FROM catalog_variants WHERE id=$1::uuid`, [sourceVariantId])).rows[0];
  if (restored.sku !== legacySku || restored.product_id !== sourceProductId || restored.options.size !== "250 g" || restored.options.type !== "legacy-wrong" || restored.options.flavor !== "legacy-wrong") throw new Error("Rollback did not restore the original variant.");
  const createdCount = Number((await client.query(`SELECT COUNT(*)::int AS count FROM catalog_variants WHERE sku=$1`, [createSku])).rows[0].count);
  const aliasCount = Number((await client.query(`SELECT COUNT(*)::int AS count FROM catalog_variant_sku_aliases WHERE alias_sku=$1`, [legacySku])).rows[0].count);
  const recipeRestored = (await client.query(`SELECT catalog_product_id::text AS product_id,catalog_snapshot FROM recipe_ingredients WHERE id=$1::uuid`, [recipeIngredientId])).rows[0];
  if (createdCount !== 0 || aliasCount !== 0 || recipeRestored.product_id !== sourceProductId || recipeRestored.catalog_snapshot.sku !== legacySku) throw new Error("Rollback cleanup or recipe restore is invalid.");

  console.log(JSON.stringify({ status: "CATALOG_REMAP_BATCH_ENGINE_TEST_PASS", batchId, remappedVariantId: sourceVariantId }, null, 2));
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  if (recipeId) await client.query(`DELETE FROM recipes WHERE id=$1::uuid`, [recipeId]).catch(() => undefined);
  if (batchId) await client.query(`DELETE FROM catalog_group_remap_batches WHERE id=$1::uuid`, [batchId]).catch(() => undefined);
  if (sourceVariantId) await client.query(`DELETE FROM catalog_variants WHERE id=$1::uuid`, [sourceVariantId]).catch(() => undefined);
  if (survivorVariantId) await client.query(`DELETE FROM catalog_variants WHERE id=$1::uuid`, [survivorVariantId]).catch(() => undefined);
  if (sourceProductId) await client.query(`DELETE FROM catalog_products WHERE id=$1::uuid`, [sourceProductId]).catch(() => undefined);
  if (targetProductId) await client.query(`DELETE FROM catalog_products WHERE id=$1::uuid`, [targetProductId]).catch(() => undefined);
  client.release();
  await pool.end();
  fs.rmSync(tempDir, { recursive: true, force: true });
}