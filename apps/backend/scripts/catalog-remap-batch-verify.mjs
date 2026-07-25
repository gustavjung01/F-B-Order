import path from "node:path";
import { assert, clean, upper, lower, packagingOf, readJson, repoRoot, normalizeManifest, normalizeCommercial } from "./catalog-remap-batch-common.mjs";

async function verifyAppliedTasks(client, configs) {
  const expectedRows = configs.flatMap((config) => config.manifest.rows.map((row) => ({ ...row, taskId: config.manifest.taskId })));
  const canonicalSkus = expectedRows.map((row) => upper(row.canonicalSku));
  const remaps = expectedRows.filter((row) => row.action === "REMAP");
  const productKeys = [...new Set(configs.flatMap((config) => config.manifest.parents.map((parent) => parent.productKey)))];
  const variantResult = await client.query(`SELECT variant.id::text AS "variantId",UPPER(variant.sku) AS sku,variant.product_id::text AS "productId",variant.price_mode AS "priceMode",variant.status,variant.is_active AS "isActive",variant.is_public AS "isPublic",variant.is_orderable AS "isOrderable",variant.options,packaging.measure_mode AS "measureMode",packaging.sell_unit AS "sellUnit",packaging.package_quantity::float8 AS "packageQuantity",packaging.package_unit AS "packageUnit",packaging.net_quantity::float8 AS "netQuantity",packaging.net_unit AS "netUnit" FROM catalog_variants variant LEFT JOIN catalog_variant_packaging_specs packaging ON packaging.variant_id=variant.id WHERE UPPER(variant.sku)=ANY($1::text[]) ORDER BY UPPER(variant.sku)`, [canonicalSkus]);
  assert(variantResult.rows.length === expectedRows.length, `Expected ${expectedRows.length} canonical variants after apply, found ${variantResult.rows.length}.`, "CATALOG_REMAP_VERIFY_VARIANT_COUNT");
  const bySku = new Map(variantResult.rows.map((row) => [row.sku, row]));
  for (const expected of expectedRows) {
    const current = bySku.get(upper(expected.canonicalSku));
    assert(current, `Canonical SKU ${expected.canonicalSku} is missing after apply.`, "CATALOG_REMAP_VERIFY_SKU_MISSING");
    assert(current.priceMode === "fixed" && current.status === "active" && current.isActive && current.isPublic && current.isOrderable, `Canonical SKU ${expected.canonicalSku} is not active/orderable fixed-price.`, "CATALOG_REMAP_VERIFY_VARIANT_STATE");
    const pack = packagingOf(expected);
    assert(current.measureMode === pack.measureMode && lower(current.sellUnit) === pack.sellUnit && Number(current.packageQuantity) === Number(pack.packageQuantity) && lower(current.packageUnit) === pack.packageUnit, `Packaging shell mismatch for ${expected.canonicalSku}.`, "CATALOG_REMAP_VERIFY_PACKAGING_SHELL");
    if (pack.measureMode === "count_only") {
      assert(current.netQuantity === null && current.netUnit === null && !Object.prototype.hasOwnProperty.call(current.options || {}, "size"), `COUNT_ONLY state is invalid for ${expected.canonicalSku}.`, "CATALOG_REMAP_VERIFY_COUNT_ONLY");
    } else {
      assert(Number(current.netQuantity) === Number(pack.netQuantity) && lower(current.netUnit) === pack.netUnit && clean(current.options?.size), `Measured state is invalid for ${expected.canonicalSku}.`, "CATALOG_REMAP_VERIFY_MEASURED");
    }
  }
  for (const expected of remaps) {
    const alias = await client.query(`SELECT variant.sku,alias.variant_id::text AS "variantId" FROM catalog_variant_sku_aliases alias JOIN catalog_variants variant ON variant.id=alias.variant_id WHERE UPPER(alias.alias_sku)=UPPER($1)`, [expected.legacySku]);
    assert(alias.rows.length === 1 && upper(alias.rows[0].sku) === upper(expected.canonicalSku), `Legacy alias ${expected.legacySku} does not resolve to ${expected.canonicalSku}.`, "CATALOG_REMAP_VERIFY_ALIAS");
  }
  const variantIds = variantResult.rows.map((row) => row.variantId);
  const recipeResult = await client.query(`SELECT COUNT(*)::int AS count FROM recipe_ingredients ingredient JOIN catalog_variants variant ON variant.id=ingredient.catalog_variant_id WHERE ingredient.catalog_variant_id=ANY($1::uuid[]) AND (ingredient.catalog_product_id IS DISTINCT FROM variant.product_id OR ingredient.catalog_snapshot->>'variantId' IS DISTINCT FROM variant.id::text OR ingredient.catalog_snapshot->>'productId' IS DISTINCT FROM variant.product_id::text OR UPPER(ingredient.catalog_snapshot->>'sku') IS DISTINCT FROM UPPER(variant.sku) OR ingredient.catalog_snapshot->>'variantName' IS DISTINCT FROM variant.name)`, [variantIds]);
  assert(Number(recipeResult.rows[0]?.count) === 0, "Recipe catalog links or snapshots are inconsistent after apply.", "CATALOG_REMAP_VERIFY_RECIPE_LINKS", recipeResult.rows[0]);
  const productResult = await client.query(`SELECT COUNT(*)::int AS count FROM catalog_products WHERE product_key=ANY($1::text[]) AND status='active'`, [productKeys]);
  assert(Number(productResult.rows[0]?.count) === productKeys.length, `Expected ${productKeys.length} active target parents.`, "CATALOG_REMAP_VERIFY_PARENT_COUNT");
  return { canonicalVariantCount: variantResult.rows.length, remapAliasCount: remaps.length, createNewCount: expectedRows.filter((row) => row.action === "CREATE_NEW").length, measuredCount: expectedRows.filter((row) => packagingOf(row).measureMode === "measured").length, countOnlyCount: expectedRows.filter((row) => packagingOf(row).measureMode === "count_only").length, recipeMismatchCount: 0, activeParentCount: productKeys.length };
}

function loadTaskConfig(configPath) {
  const config = readJson(configPath, "Task configuration");
  assert(Array.isArray(config.tasks) && config.tasks.length > 0, "Task configuration needs tasks.", "CATALOG_REMAP_TASK_CONFIG_INVALID");
  return config.tasks.map((task) => {
    const manifestPath = path.resolve(repoRoot, task.manifest);
    const commercialPath = path.resolve(repoRoot, task.commercialFile);
    return { task, manifestPath, commercialPath, manifest: normalizeManifest(readJson(manifestPath, "Manifest")), payload: normalizeCommercial(readJson(commercialPath, "Commercial payload")) };
  });
}

export { verifyAppliedTasks, loadTaskConfig };
