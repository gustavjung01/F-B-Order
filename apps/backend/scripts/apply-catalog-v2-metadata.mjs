import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { loadCatalogV2ProductMetadata } from "./catalog-v2-product-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(here, "../../..");

export async function applyCatalogV2Metadata(client, repoRoot = defaultRepoRoot) {
  const metadata = loadCatalogV2ProductMetadata(repoRoot);
  const products = await client.query(`SELECT id::text, product_key, name, industry_key, source_group
    FROM catalog_products WHERE catalog_version='hung-phat-v2' AND status='active'`);
  let groups = 0;
  let choices = 0;
  let variants = 0;
  let variantNames = 0;
  let productOverrides = 0;

  for (const row of products.rows) {
    const value = metadata.forProduct({
      productKey: row.product_key,
      name: row.name,
      industryKey: row.industry_key,
      sourceGroup: row.source_group,
    });
    const result = await client.query(`UPDATE catalog_products SET
      catalog_group_key=$2,
      choice_groups=$3::jsonb,
      name=COALESCE($4,name),
      brand=COALESCE($5,brand),
      industry=COALESCE($6,industry),
      industry_key=COALESCE($7,industry_key),
      source_group=COALESCE($8,source_group),
      subcategory=COALESCE($9,subcategory),
      option_groups=COALESCE($10::jsonb,option_groups),
      updated_at=now()
      WHERE id=$1`, [
      row.id,
      value.catalogGroupKey,
      JSON.stringify(value.choiceGroups),
      value.nameOverride,
      value.brandOverride,
      value.industryOverride,
      value.industryKeyOverride,
      value.sourceGroupOverride,
      value.subcategoryOverride,
      value.optionGroupsOverride ? JSON.stringify(value.optionGroupsOverride) : null,
    ]);
    if (result.rowCount !== 1) throw new Error(`Missing metadata product ${row.product_key}`);
    if (value.catalogGroupKey) groups += 1;
    if (value.choiceGroups.length) choices += 1;
    if (
      value.nameOverride || value.brandOverride || value.industryOverride
      || value.industryKeyOverride || value.sourceGroupOverride
      || value.subcategoryOverride || value.optionGroupsOverride
    ) productOverrides += 1;

    for (const [sku, options] of Object.entries(value.variantOptions)) {
      const variantResult = await client.query(`UPDATE catalog_variants
        SET options=(options-'flavor'-'flavor_or_type') || $3::jsonb, updated_at=now()
        WHERE product_id=$1 AND sku=$2`, [row.id, sku, JSON.stringify(options)]);
      if (variantResult.rowCount !== 1) throw new Error(`Missing metadata variant ${row.product_key}/${sku}`);
      variants += 1;
    }

    for (const [sku, name] of Object.entries(value.variantNameOverrides)) {
      const nameResult = await client.query(`UPDATE catalog_variants
        SET name=$3, updated_at=now() WHERE product_id=$1 AND sku=$2`, [row.id, sku, name]);
      if (nameResult.rowCount !== 1) throw new Error(`Missing metadata variant name ${row.product_key}/${sku}`);
      variantNames += 1;
    }
  }

  const disabledSkus = [...metadata.disabledSkus];
  const disabledResult = await client.query(`UPDATE catalog_variants SET is_active=false, is_public=false,
    is_orderable=false, status='inactive', updated_at=now()
    WHERE catalog_version='hung-phat-v2' AND sku=ANY($1::text[])`, [disabledSkus]);
  if ((disabledResult.rowCount ?? 0) !== disabledSkus.length) {
    throw new Error(`Expected to disable ${disabledSkus.length} metadata variants, found ${disabledResult.rowCount ?? 0}.`);
  }

  return { groups, choices, variants, variantNames, productOverrides, disabledSkus };
}

async function runCli() {
  const repoRoot = defaultRepoRoot;
  for (const file of [path.join(repoRoot, ".env"), path.join(here, "../.env"), path.join(here, "../.env.local")]) {
    if (fs.existsSync(file)) dotenv.config({ path: file });
  }

  const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL or BEPSI_DATABASE_URL is required.");
  const remote = !["localhost", "127.0.0.1", "::1"].includes(new URL(connectionString).hostname);
  if (!process.argv.includes("--apply")) throw new Error("Metadata sync requires --apply.");
  if (remote && !process.argv.includes("--allow-remote-apply")) throw new Error("Remote metadata sync requires --allow-remote-apply.");

  const pool = new pg.Pool({ connectionString, ssl: remote ? { rejectUnauthorized: false } : false, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyCatalogV2Metadata(client, repoRoot);
    await client.query("COMMIT");
    console.log(JSON.stringify({ status: "CATALOG_METADATA_APPLIED", ...result }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await runCli();
