import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { assert, clean, sha256, stableStringify, buildOptions, readJson } from "./catalog-remap-batch-common.mjs";
import { normalizeCorrectionManifest, validateCorrectionCommercial } from "./sinh-to-mut-correction-common.mjs";
import { buildCorrectionPlan } from "./sinh-to-mut-correction-state.mjs";
import { applyTask, rollbackTask, verifyAppliedCorrection } from "./sinh-to-mut-correction-apply.mjs";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const manifestPath = path.join(repoRoot, "data/catalog-remap/sinh-to-mut-correction-01.json");
const sourceCatalogPath = path.join(repoRoot, "data/catalog/hung-phat/v2/manifests/products.json");
const enginePath = path.join(here, "sinh-to-mut-correction-engine.mjs");
const tempDir = path.join(repoRoot, "artifacts/catalog-remap", `sinh-to-mut-test-${crypto.randomBytes(4).toString("hex")}`);

function loadEnvironment() {
  for (const envPath of [path.join(repoRoot, ".env"), path.join(here, "../.env"), path.join(here, "../.env.local")]) {
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
  }
}

function fail(message) {
  throw new Error(message);
}

function priceMapFromCatalog(raw) {
  const map = new Map();
  for (const product of Array.isArray(raw) ? raw : []) {
    for (const variant of Array.isArray(product.variants) ? product.variants : []) {
      const sku = String(variant.sku || "").trim().toUpperCase();
      if (!sku) continue;
      map.set(sku, Number(variant.price));
    }
  }
  return map;
}

async function main() {
  loadEnvironment();
  const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL || "";
  if (!connectionString) fail("DATABASE_URL or BEPSI_DATABASE_URL is required for the correction engine test.");

  const url = new URL(connectionString);
  const localConnection = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const pool = new Pool({ connectionString, ssl: localConnection ? false : { rejectUnauthorized: false }, max: 1 });
  const client = await pool.connect();

  const baseManifest = normalizeCorrectionManifest(readJson(manifestPath, "Correction manifest"));
  const sourceCatalog = readJson(sourceCatalogPath, "Source catalog");
  const sourcePrices = priceMapFromCatalog(sourceCatalog);
  const suffix = crypto.randomBytes(4).toString("hex");
  const manifest = {
    ...baseManifest,
    rows: baseManifest.rows.map((row) => {
      const baseSku = row.action === "REMAP" ? row.legacySku : row.canonicalSku;
      return {
        ...row,
        sourceSku: baseSku,
        canonicalSku: `${row.canonicalSku}-T${suffix}`.toUpperCase(),
        legacySku: row.legacySku ? `${row.legacySku}-T${suffix}`.toUpperCase() : null,
      };
    }),
  };

  const fixture = new Map();
  const aliasRows = [];

  try {
    await client.query("BEGIN");

    const productionParents = await client.query(
      `SELECT id::text AS "id", product_key AS "productKey", name, brand, subcategory
       FROM catalog_products
       WHERE product_key = ANY($1::text[])`,
      [["sinh-to-berino", "mut-gold"]],
    );
    const productionParentsByKey = new Map(productionParents.rows.map((row) => [row.productKey, row]));
    assert(clean(productionParentsByKey.get("sinh-to-berino")?.name).length > 0, "Berino production parent is missing.");
    assert(clean(productionParentsByKey.get("mut-gold")?.name).length > 0, "Goldenfarm production parent is missing.");
    assert(clean(productionParentsByKey.get("sinh-to-berino")?.subcategory) === "Berino", "BERKWI must belong to Berino.");
    assert(clean(productionParentsByKey.get("mut-gold")?.subcategory) === "Goldenfarm", "STGPBT must belong to Goldenfarm.");

    await client.query(`DELETE FROM catalog_group_remap_batches WHERE task_id = $1`, [manifest.taskId]).catch(() => undefined);

    const berinoId = productionParentsByKey.get("sinh-to-berino").id;
    const goldenfarmId = productionParentsByKey.get("mut-gold").id;
    const canonicalParentId = (detailGroup) => (detailGroup === "Berino" ? berinoId : goldenfarmId);
    for (const expected of manifest.rows) {
      const productId = canonicalParentId(expected.detailGroup);
      const currentSku = expected.action === "REMAP" ? expected.legacySku : expected.canonicalSku;
      const sourceSku = expected.sourceSku || currentSku;
      const price = sourcePrices.get(String(sourceSku).toUpperCase()) || (expected.detailGroup === "Berino" ? 70000 : 76000);
      const currentPrice = Math.max(1, price - 5000);
      const variantKey = `${currentSku.toLowerCase()}-fixture-${suffix}`;
      const variant = (await client.query(
        `INSERT INTO catalog_variants (
           product_id, variant_key, sku, name, options, price_mode, shop_price, status, is_active, is_public, is_orderable, sort_order
         ) VALUES ($1::uuid,$2,$3,$4,$5::jsonb,'fixed',$6,'active',true,true,true,0)
         RETURNING id::text AS id, product_id::text AS "productId", sku, name, options, shop_price::float8 AS "shopPrice"`,
        [
          productId,
          variantKey,
          currentSku,
          `Legacy ${expected.name}`,
          JSON.stringify({
            type: "legacy-type",
            flavor: "legacy-flavor",
            package: "12 chai / thung",
            size: expected.netQuantity ? `${expected.netQuantity} ${expected.netUnit}` : undefined,
            weight: expected.netQuantity ? `${expected.netQuantity} ${expected.netUnit}` : undefined,
          }),
          currentPrice,
        ],
      )).rows[0];

      await client.query(
        `INSERT INTO catalog_variant_packaging_specs (
           variant_id, sell_unit, package_quantity, package_unit, net_quantity, net_unit, measure_mode,
           conversion_status, source, confidence, note, verified_by, verified_date, raw_source
         ) VALUES ($1::uuid,'chai',12,'thung',$2,$3,'measured','verified','fixture','high',$4,'fixture',CURRENT_DATE,$5::jsonb)`,
        [
          variant.id,
          expected.netQuantity,
          expected.netUnit,
          `Fixture packaging for ${expected.canonicalSku}`,
          JSON.stringify({ expectedSku: expected.canonicalSku, legacySku: expected.legacySku || null }),
        ],
      );

      const recipeId = (await client.query(
        `INSERT INTO recipes (slug, title, status) VALUES ($1,$2,'needs_review') RETURNING id::text AS id`,
        [`recipe-${currentSku.toLowerCase()}-${suffix}`, `Recipe ${currentSku}`],
      )).rows[0].id;

      const snapshot = {
        variantId: variant.id,
        productId,
        sku: currentSku,
        productName: expected.detailGroup === "Berino" ? "Sinh tố Berino" : "Goldenfarm",
        variantName: `Legacy ${expected.name}`,
      };

      const ingredientId = (await client.query(
        `INSERT INTO recipe_ingredients (
           recipe_id, product_name, quantity, unit, source_type, catalog_product_id, catalog_variant_id, catalog_snapshot
         ) VALUES ($1::uuid,$2,1,'g','manual',$3::uuid,$4::uuid,$5::jsonb)
         RETURNING id::text AS id`,
        [recipeId, `Legacy ${expected.name}`, productId, variant.id, JSON.stringify(snapshot)],
      )).rows[0].id;

      fixture.set(expected.canonicalSku, {
        expected,
        currentVariantId: variant.id,
        currentProductId: productId,
        currentSku,
        currentPrice,
        recipeId,
        ingredientId,
      });

      if (expected.legacySku && expected.action === "UPDATE_EXISTING") {
        await client.query(
          `INSERT INTO catalog_variant_sku_aliases (alias_sku, variant_id, source)
           VALUES ($1,$2::uuid,$3)`,
          [expected.legacySku, variant.id, "fixture"],
        );
        aliasRows.push(expected.legacySku);
      }
    }

    const payloadRows = manifest.rows.map((expected) => {
      const fixtureRow = fixture.get(expected.canonicalSku);
      const sourcePrice = sourcePrices.get(String(expected.sourceSku || expected.legacySku || expected.canonicalSku).toUpperCase()) || 70000;
      const unitPrice = sourcePrice > 0 ? sourcePrice : 70000;
      return {
        sku: expected.canonicalSku,
        action: expected.action,
        legacySku: expected.legacySku || "",
        name: expected.name,
        group: manifest.catalogGroupName,
        detailGroup: expected.detailGroup,
        status: "ready",
        measureMode: "measured",
        sellUnit: expected.sellUnit,
        packageQuantity: expected.packageQuantity,
        packageUnit: expected.packageUnit,
        netQuantity: expected.netQuantity,
        netUnit: expected.netUnit,
        unitPrice,
        derivedPackagePrice: Math.round(unitPrice * Number(expected.packageQuantity)),
        sourceRow: expected.sourceRow,
        sourceMatchStatus: fixtureRow?.currentSku === expected.legacySku ? "fixture" : "catalog-source",
      };
    });

    const payload = {
      schemaVersion: 1,
      taskId: manifest.taskId,
      sourceKey: "sinh-to-mut-correction-01",
      sourceFile: sourceCatalogPath,
      rows: payloadRows,
    };
    payload.payloadHash = sha256({ schemaVersion: payload.schemaVersion, sourceKey: payload.sourceKey, rows: payload.rows });
    validateCorrectionCommercial(manifest, payload);

    const plan = await buildCorrectionPlan(client, manifest, payload, { lock: true });
    assert(plan.pass, `Dry-run should pass for the synthetic fixture, got blockers: ${JSON.stringify(plan.summary)}`);
    assert(plan.summary.updateExistingCount === 23, "Expected 23 update-existing rows.");
    assert(plan.summary.remapCount === 2, "Expected 2 remap rows.");
    assert(plan.summary.createNewCount === 0, "Expected 0 create-new rows.");

    const badManifest = path.join(tempDir, "bad-manifest.json");
    const badPayload = path.join(tempDir, "bad-payload.json");
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(badManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.writeFileSync(badPayload, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    const teaReject = spawnSync("node", [enginePath, `--manifest=${badManifest}`, `--commercial-file=${badPayload}`, "--apply", "--confirm-production=BEPSI_TEA_48"], { cwd: repoRoot, env: process.env, encoding: "utf8" });
    assert(teaReject.status !== 0, "Tea confirmation token must be rejected.");
    const gionReject = spawnSync("node", [enginePath, `--manifest=${badManifest}`, `--commercial-file=${badPayload}`, "--apply", "--confirm-production=BEPSI_3Q_GION_12"], { cwd: repoRoot, env: process.env, encoding: "utf8" });
    assert(gionReject.status !== 0, "3Q confirmation token must be rejected.");

    const applyResult = await applyTask(client, manifest, payload);
    assert(applyResult.verification.updateExistingVariantIdsPreservedCount === 23, "Expected 23 preserved update-existing variant IDs.");
    assert(applyResult.verification.remapAliasCount === 2, "Expected 2 remap aliases.");
    assert(applyResult.verification.recipeMismatchCount === 0, "Expected zero recipe mismatches.");
    assert(applyResult.verification.activeParentCount === 2, "Expected two active target parents.");
    assert(applyResult.verification.typeFlavorSplitCount === 25, "Expected all 25 rows to satisfy type/flavor split.");
    assert(applyResult.verification.priceMatchCount === 25, "Expected all 25 rows to match price.");
    assert(applyResult.verification.packagingMatchCount === 25, "Expected all 25 rows to match packaging.");

    const afterApply = await client.query(
      `SELECT variant.id::text AS id, variant.sku, variant.product_id::text AS "productId", variant.options, variant.shop_price::float8 AS "shopPrice"
       FROM catalog_variants variant
       WHERE UPPER(variant.sku) = ANY($1::text[])
       ORDER BY UPPER(variant.sku)`,
      [manifest.rows.map((row) => row.canonicalSku.toUpperCase())],
    );
    assert(afterApply.rows.length === 25, "Expected 25 canonical variants after apply.");

    const afterMap = new Map(afterApply.rows.map((row) => [String(row.sku).toUpperCase(), row]));
    for (const expected of manifest.rows) {
      const current = afterMap.get(expected.canonicalSku.toUpperCase());
      assert(current, `Missing canonical row ${expected.canonicalSku} after apply.`);
      assert(stableStringify(current.options || {}) === stableStringify(buildOptions({}, { ...expected, attributeModelVersion: 1 })), `Option mismatch for ${expected.canonicalSku}.`);
    }

    const rollback = await rollbackTask(client, applyResult.batchId);
    assert(rollback.restoredVariants === 25, "Rollback should restore 25 variants.");

    const restored = await client.query(
      `SELECT variant.id::text AS id, variant.sku, variant.product_id::text AS "productId", variant.options, variant.shop_price::float8 AS "shopPrice"
       FROM catalog_variants variant
       WHERE UPPER(variant.sku) = ANY($1::text[])
       ORDER BY UPPER(variant.sku)`,
      [manifest.rows.map((row) => (row.action === "REMAP" ? row.legacySku : row.canonicalSku).toUpperCase())],
    );
    assert(restored.rows.length === 25, "Rollback should restore the original 25 fixture SKUs.");
    const restoredBySku = new Map(restored.rows.map((row) => [String(row.sku).toUpperCase(), row]));
    for (const expected of manifest.rows) {
      const restoredRow = restoredBySku.get((expected.action === "REMAP" ? expected.legacySku : expected.canonicalSku).toUpperCase());
      assert(restoredRow, `Missing restored row for ${expected.canonicalSku}.`);
      const fixtureRow = fixture.get(expected.canonicalSku);
      assert(Number(restoredRow.shopPrice) === Number(fixtureRow.currentPrice), `Rollback should restore pre-apply price state for ${expected.canonicalSku}.`);
    }

    const verifySummary = await verifyAppliedCorrection(client, manifest, payload).catch((error) => error);
    assert(verifySummary instanceof Error, "Verification should fail after rollback.");

    console.log(JSON.stringify({
      status: "SINH_TO_MUT_CORRECTION_ENGINE_TEST_PASS",
      batchId: applyResult.batchId,
      verification: applyResult.verification,
      rollback,
    }, null, 2));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAILED",
    code: error?.code || "SINH_TO_MUT_CORRECTION_ENGINE_TEST_FAILED",
    message: error instanceof Error ? error.message : String(error),
    details: error?.details,
  }, null, 2));
  process.exit(1);
});
