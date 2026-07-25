import { assert, clean, upper, lower, validateManifestCommercial } from "./catalog-remap-batch-common.mjs";

const PRODUCT_FIELDS = `id::text AS "id", catalog_version AS "catalogVersion", product_key AS "productKey", name, brand, industry, industry_key AS "industryKey", catalog_group_key AS "catalogGroupKey", subcategory, source_group AS "sourceGroup", option_groups AS "optionGroups", choice_groups AS "choiceGroups", cover_image_key AS "coverImageKey", cover_image_object_key AS "coverImageObjectKey", status, sort_order AS "sortOrder"`;
const VARIANT_FIELDS = `id::text AS "id", product_id::text AS "productId", catalog_version AS "catalogVersion", variant_key AS "variantKey", sku, name, options, price_mode AS "priceMode", price_label AS "priceLabel", retail_price::float8 AS "retailPrice", shop_price::float8 AS "shopPrice", image_key AS "imageKey", image_object_key AS "imageObjectKey", status, is_active AS "isActive", is_public AS "isPublic", is_orderable AS "isOrderable", sort_order AS "sortOrder"`;
const QUALIFIED_VARIANT_FIELDS = `variant.id::text AS "id", variant.product_id::text AS "productId", variant.catalog_version AS "catalogVersion", variant.variant_key AS "variantKey", variant.sku, variant.name, variant.options, variant.price_mode AS "priceMode", variant.price_label AS "priceLabel", variant.retail_price::float8 AS "retailPrice", variant.shop_price::float8 AS "shopPrice", variant.image_key AS "imageKey", variant.image_object_key AS "imageObjectKey", variant.status, variant.is_active AS "isActive", variant.is_public AS "isPublic", variant.is_orderable AS "isOrderable", variant.sort_order AS "sortOrder"`;

async function assertSchema(client) {
  const result = await client.query(`SELECT
    to_regclass('public.catalog_group_remap_batches')::text AS "batchTable",
    to_regclass('public.catalog_variant_sku_aliases')::text AS "aliasTable",
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_variant_packaging_specs' AND column_name='measure_mode') AS "measureMode"`);
  const schema = result.rows[0] || {};
  assert(schema.batchTable && schema.aliasTable, "Migration 031 is missing.", "CATALOG_REMAP_MIGRATION_031_MISSING");
  assert(schema.measureMode, "Migration 032 is missing.", "CATALOG_REMAP_MIGRATION_032_MISSING");
}

async function productByKey(client, key, lock = false) {
  const result = await client.query(`SELECT ${PRODUCT_FIELDS} FROM catalog_products WHERE product_key=$1 ${lock ? "FOR UPDATE" : ""}`, [key]);
  return result.rows[0] || null;
}
async function variantByActualSku(client, sku, lock = false) {
  const result = await client.query(`SELECT ${VARIANT_FIELDS} FROM catalog_variants WHERE UPPER(sku)=UPPER($1) ${lock ? "FOR UPDATE" : ""}`, [sku]);
  return result.rows[0] || null;
}
async function variantBySkuOrAlias(client, sku, lock = false) {
  const actual = await variantByActualSku(client, sku, lock);
  if (actual) return actual;
  const result = await client.query(`SELECT ${QUALIFIED_VARIANT_FIELDS}
    FROM catalog_variant_sku_aliases alias JOIN catalog_variants variant ON variant.id=alias.variant_id
    WHERE UPPER(alias.alias_sku)=UPPER($1) ${lock ? "FOR UPDATE OF variant" : ""}`, [sku]);
  return result.rows[0] || null;
}

async function loadPackaging(client, variantIds) {
  if (!variantIds.length) return [];
  const result = await client.query(`SELECT variant_id::text AS "variantId", sell_unit AS "sellUnit", package_quantity::float8 AS "packageQuantity", package_unit AS "packageUnit", net_quantity::float8 AS "netQuantity", net_unit AS "netUnit", measure_mode AS "measureMode", conversion_status AS "conversionStatus", source, confidence, source_url AS "sourceUrl", note, verified_by AS "verifiedBy", verified_date::text AS "verifiedDate", raw_source AS "rawSource", created_at::text AS "createdAt", updated_at::text AS "updatedAt" FROM catalog_variant_packaging_specs WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id`, [variantIds]);
  return result.rows;
}

async function snapshotState(client, { productIds, variantIds, legacySkus }) {
  const pids = [...new Set(productIds.filter(Boolean))];
  const vids = [...new Set(variantIds.filter(Boolean))];
  const aliases = legacySkus.length ? (await client.query(`SELECT alias_sku AS "aliasSku", variant_id::text AS "variantId", source, created_at::text AS "createdAt" FROM catalog_variant_sku_aliases WHERE UPPER(alias_sku)=ANY($1::text[]) ORDER BY UPPER(alias_sku)`, [legacySkus.map(upper)])).rows : [];
  const products = pids.length ? (await client.query(`SELECT ${PRODUCT_FIELDS} FROM catalog_products WHERE id=ANY($1::uuid[]) ORDER BY id`, [pids])).rows : [];
  const variants = vids.length ? (await client.query(`SELECT ${VARIANT_FIELDS} FROM catalog_variants WHERE id=ANY($1::uuid[]) ORDER BY id`, [vids])).rows : [];
  const packaging = await loadPackaging(client, vids);
  const recipes = vids.length ? (await client.query(`SELECT id::text AS "id", catalog_variant_id::text AS "variantId", catalog_product_id::text AS "productId", catalog_snapshot AS "snapshot" FROM recipe_ingredients WHERE catalog_variant_id=ANY($1::uuid[]) ORDER BY id`, [vids])).rows : [];
  const references = vids.length ? (await client.query(`SELECT v.id::text AS "variantId", (SELECT COUNT(*)::int FROM cart_items c WHERE c.variant_id=v.id) AS "cartItems", (SELECT COUNT(*)::int FROM order_items o WHERE o.variant_id=v.id) AS "orderItems", (SELECT COUNT(*)::int FROM catalog_variant_prices p WHERE p.variant_id=v.id) AS "priceRows" FROM catalog_variants v WHERE v.id=ANY($1::uuid[]) ORDER BY v.id`, [vids])).rows : [];
  return { products, variants, aliases, packaging, recipes, references };
}

async function buildPlan(client, manifest, payload, { lock = false } = {}) {
  const commercialBySku = validateManifestCommercial(manifest, payload);
  const parents = [];
  const parentByKey = new Map();
  for (const spec of manifest.parents) {
    const existing = await productByKey(client, clean(spec.productKey), lock);
    const survivor = clean(spec.survivorLegacySku) ? await variantBySkuOrAlias(client, spec.survivorLegacySku, lock) : null;
    const blockers = [];
    if (spec.strategy === "merge_keep_first_product" && !survivor) blockers.push("survivor_missing");
    if (spec.strategy === "merge_keep_first_product" && existing && survivor && existing.id !== survivor.productId) blockers.push("target_parent_key_collision");
    const target = existing || (survivor ? await (async () => {
      const result = await client.query(`SELECT ${PRODUCT_FIELDS} FROM catalog_products WHERE id=$1::uuid ${lock ? "FOR UPDATE" : ""}`, [survivor.productId]);
      return result.rows[0] || null;
    })() : null);
    const canCreate = spec.strategy === "attach_to_existing_or_create_parent";
    if (!target && !canCreate) blockers.push("target_parent_unresolved");
    const plan = { ...spec, productKey: clean(spec.productKey), targetProduct: target, survivor, createProduct: !target && canCreate, blockers, pass: blockers.length === 0 };
    parents.push(plan);
    parentByKey.set(plan.productKey, plan);
  }
  const rows = [];
  for (const expected of manifest.rows) {
    const commercial = commercialBySku.get(upper(expected.canonicalSku));
    const parent = parentByKey.get(expected.targetParentKey);
    const canonical = await variantByActualSku(client, expected.canonicalSku, lock);
    const blockers = [];
    if (!parent?.pass) blockers.push("target_parent_blocked");
    if (canonical) blockers.push("canonical_sku_exists");
    let current = null;
    if (expected.action === "CREATE_NEW") {
      const generatedVariantKey = `${expected.targetParentKey}-${lower(expected.canonicalSku).replace(/[^a-z0-9]+/g, "-")}`;
      const keyMatch = await client.query(`SELECT id::text FROM catalog_variants WHERE variant_key=$1`, [generatedVariantKey]);
      if (keyMatch.rows[0]) blockers.push("generated_variant_key_exists");
    }
    if (expected.action === "REMAP") {
      current = await variantByActualSku(client, expected.legacySku, lock);
      if (!current) blockers.push("legacy_sku_missing");
      if (current && (!current.isActive || !current.isPublic || !current.isOrderable || current.priceMode !== "fixed")) blockers.push("legacy_variant_unavailable");
      const alias = await client.query(`SELECT variant_id::text AS "variantId" FROM catalog_variant_sku_aliases WHERE UPPER(alias_sku)=UPPER($1)`, [expected.legacySku]);
      if (alias.rows[0] && current && alias.rows[0].variantId !== current.id) blockers.push("legacy_alias_collision");
    }
    rows.push({ expected, commercial, parent, current, blockers, pass: blockers.length === 0 });
  }
  const globalBlockers = parents.flatMap((parent) => parent.blockers.map((blocker) => `${parent.productKey}:${blocker}`));
  const blockedRows = rows.filter((row) => !row.pass);
  return {
    pass: globalBlockers.length === 0 && blockedRows.length === 0,
    manifestHash: manifest.manifestHash,
    payloadHash: payload.payloadHash,
    parents,
    rows,
    summary: {
      rowCount: rows.length,
      remapCount: rows.filter((row) => row.expected.action === "REMAP").length,
      createNewCount: rows.filter((row) => row.expected.action === "CREATE_NEW").length,
      rowPassCount: rows.length - blockedRows.length,
      rowBlockedCount: blockedRows.length,
      parentCount: parents.length,
      parentsCreated: parents.filter((parent) => parent.createProduct).length,
      globalBlockers,
    },
  };
}

export { PRODUCT_FIELDS, assertSchema, productByKey, variantByActualSku, variantBySkuOrAlias, loadPackaging, snapshotState, buildPlan };
