import {
  buildOptions,
  clean,
  lower,
  packagingOf,
  stableStringify,
  upper,
} from "./catalog-remap-batch-common.mjs";
import { validateCorrectionCommercial } from "./sinh-to-mut-correction-common.mjs";

const PRODUCT_FIELDS = `id::text AS "id", catalog_version AS "catalogVersion", product_key AS "productKey", name, brand, industry, industry_key AS "industryKey", catalog_group_key AS "catalogGroupKey", subcategory, source_group AS "sourceGroup", option_groups AS "optionGroups", choice_groups AS "choiceGroups", cover_image_key AS "coverImageKey", cover_image_object_key AS "coverImageObjectKey", status, sort_order AS "sortOrder"`;
const VARIANT_FIELDS = `id::text AS "id", product_id::text AS "productId", catalog_version AS "catalogVersion", variant_key AS "variantKey", sku, name, options, price_mode AS "priceMode", shop_price::float8 AS "shopPrice", image_key AS "imageKey", image_object_key AS "imageObjectKey", status, is_active AS "isActive", is_public AS "isPublic", is_orderable AS "isOrderable", sort_order AS "sortOrder"`;

async function productByKey(client, key, lock = false) {
  return (await client.query(`SELECT ${PRODUCT_FIELDS} FROM catalog_products WHERE product_key=$1 ${lock ? "FOR UPDATE" : ""}`, [key])).rows[0] || null;
}

async function variantBySku(client, sku, lock = false) {
  const result = await client.query(`SELECT ${VARIANT_FIELDS} FROM catalog_variants WHERE UPPER(sku)=UPPER($1) ${lock ? "FOR UPDATE" : ""}`, [sku]);
  if (result.rows.length > 1) throw Object.assign(new Error(`SKU ${sku} resolves to multiple variants.`), { code: "CATALOG_CORRECTION_SKU_DUPLICATE" });
  return result.rows[0] || null;
}

async function aliasesBySku(client, legacySkus) {
  if (!legacySkus.length) return new Map();
  const result = await client.query(`SELECT UPPER(alias.alias_sku) AS "aliasSku", alias.variant_id::text AS "variantId", UPPER(variant.sku) AS "canonicalSku", alias.source
    FROM catalog_variant_sku_aliases alias
    JOIN catalog_variants variant ON variant.id=alias.variant_id
    WHERE UPPER(alias.alias_sku)=ANY($1::text[])`, [legacySkus.map(upper)]);
  return new Map(result.rows.map((row) => [row.aliasSku, row]));
}

async function packagingByVariantIds(client, variantIds) {
  if (!variantIds.length) return new Map();
  const rows = (await client.query(`SELECT variant_id::text AS "variantId", sell_unit AS "sellUnit",
    package_quantity::float8 AS "packageQuantity", package_unit AS "packageUnit",
    net_quantity::float8 AS "netQuantity", net_unit AS "netUnit", measure_mode AS "measureMode"
    FROM catalog_variant_packaging_specs WHERE variant_id=ANY($1::uuid[])`, [variantIds])).rows;
  return new Map(rows.map((row) => [row.variantId, row]));
}

async function referencesByVariantIds(client, variantIds) {
  if (!variantIds.length) return new Map();
  const rows = (await client.query(`SELECT variant.id::text AS "variantId",
    (SELECT COUNT(*)::int FROM cart_items item WHERE item.variant_id=variant.id) AS "cartItems",
    (SELECT COUNT(*)::int FROM order_items item WHERE item.variant_id=variant.id) AS "orderItems",
    (SELECT COUNT(*)::int FROM recipe_ingredients item WHERE item.catalog_variant_id=variant.id) AS "recipeIngredients",
    (SELECT COUNT(*)::int FROM catalog_variant_prices price WHERE price.variant_id=variant.id) AS "priceRows"
    FROM catalog_variants variant WHERE variant.id=ANY($1::uuid[])`, [variantIds])).rows;
  return new Map(rows.map((row) => [row.variantId, row]));
}

async function snapshotCorrectionState(client, { productIds = [], variantIds = [], legacySkus = [] }) {
  const pids = [...new Set(productIds.filter(Boolean))];
  const vids = [...new Set(variantIds.filter(Boolean))];
  const products = pids.length ? (await client.query(`SELECT ${PRODUCT_FIELDS} FROM catalog_products WHERE id=ANY($1::uuid[]) ORDER BY id`, [pids])).rows : [];
  const variants = vids.length ? (await client.query(`SELECT ${VARIANT_FIELDS} FROM catalog_variants WHERE id=ANY($1::uuid[]) ORDER BY id`, [vids])).rows : [];
  const aliases = legacySkus.length ? (await client.query(`SELECT alias_sku AS "aliasSku", variant_id::text AS "variantId", source, created_at::text AS "createdAt" FROM catalog_variant_sku_aliases WHERE UPPER(alias_sku)=ANY($1::text[]) ORDER BY UPPER(alias_sku)`, [legacySkus.map(upper)])).rows : [];
  const packaging = vids.length ? (await client.query(`SELECT variant_id::text AS "variantId", sell_unit AS "sellUnit", package_quantity::float8 AS "packageQuantity", package_unit AS "packageUnit", net_quantity::float8 AS "netQuantity", net_unit AS "netUnit", measure_mode AS "measureMode", conversion_status AS "conversionStatus", source, confidence, source_url AS "sourceUrl", note, verified_by AS "verifiedBy", verified_date::text AS "verifiedDate", raw_source AS "rawSource", created_at::text AS "createdAt", updated_at::text AS "updatedAt" FROM catalog_variant_packaging_specs WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id`, [vids])).rows : [];
  const recipes = vids.length ? (await client.query(`SELECT id::text AS "id", catalog_variant_id::text AS "variantId", catalog_product_id::text AS "productId", catalog_snapshot AS "snapshot" FROM recipe_ingredients WHERE catalog_variant_id=ANY($1::uuid[]) ORDER BY id`, [vids])).rows : [];
  const references = vids.length ? (await client.query(`SELECT variant.id::text AS "variantId", (SELECT COUNT(*)::int FROM cart_items item WHERE item.variant_id=variant.id) AS "cartItems", (SELECT COUNT(*)::int FROM order_items item WHERE item.variant_id=variant.id) AS "orderItems", (SELECT COUNT(*)::int FROM recipe_ingredients item WHERE item.catalog_variant_id=variant.id) AS "recipeIngredients", (SELECT COUNT(*)::int FROM catalog_variant_prices price WHERE price.variant_id=variant.id) AS "priceRows" FROM catalog_variants variant WHERE variant.id=ANY($1::uuid[])`, [vids])).rows : [];
  return { products, variants, aliases, packaging, recipes, references };
}

async function buildCorrectionPlan(client, manifest, payload, { lock = false } = {}) {
  const commercialBySku = validateCorrectionCommercial(manifest, payload);
  const parentPlans = [];
  const parentByKey = new Map();

  for (const parent of manifest.parents) {
    const current = await productByKey(client, parent.productKey, lock);
    const blockers = [];
    if (!current) blockers.push("target_parent_missing");
    const plan = {
      ...parent,
      current,
      blockers,
      pass: blockers.length === 0,
      metadataChanges: current ? {
        name: clean(current.name) !== parent.name,
        brand: clean(current.brand) !== parent.brand,
        industryKey: clean(current.industryKey) !== manifest.industryKey,
        catalogGroupKey: clean(current.catalogGroupKey) !== manifest.catalogGroupKey,
        subcategory: clean(current.subcategory) !== parent.detailGroup,
      } : null,
    };
    parentPlans.push(plan);
    parentByKey.set(parent.productKey, plan);
  }

  const traceLegacySkus = manifest.rows.map((row) => row.legacySku).filter(Boolean);
  const aliasMap = await aliasesBySku(client, traceLegacySkus);
  const provisional = [];

  for (const expected of manifest.rows) {
    const parent = parentByKey.get(expected.targetParentKey);
    const commercial = commercialBySku.get(upper(expected.canonicalSku));
    const canonical = await variantBySku(client, expected.canonicalSku, lock);
    const legacy = expected.action === "REMAP" ? await variantBySku(client, expected.legacySku, lock) : null;
    const current = expected.action === "UPDATE_EXISTING" ? canonical : legacy;
    const alias = expected.legacySku ? aliasMap.get(upper(expected.legacySku)) || null : null;
    const blockers = [];

    if (!parent?.pass) blockers.push("target_parent_blocked");
    if (expected.action === "UPDATE_EXISTING") {
      if (!canonical) blockers.push("canonical_sku_missing");
      if (canonical && (!canonical.isActive || !canonical.isPublic || !canonical.isOrderable || canonical.priceMode !== "fixed")) blockers.push("canonical_variant_unavailable");
      if (expected.legacySku && (!alias || alias.variantId !== canonical?.id || alias.canonicalSku !== upper(expected.canonicalSku))) blockers.push("legacy_alias_trace_invalid");
    } else {
      if (!legacy) blockers.push("legacy_sku_missing");
      if (canonical) blockers.push("canonical_sku_exists");
      if (legacy && (!legacy.isActive || !legacy.isPublic || !legacy.isOrderable || legacy.priceMode !== "fixed")) blockers.push("legacy_variant_unavailable");
      if (alias && alias.variantId !== legacy?.id) blockers.push("legacy_alias_collision");
    }
    provisional.push({ expected, parent, commercial, current, alias, blockers });
  }

  const variantIds = provisional.map((row) => row.current?.id).filter(Boolean);
  const packagingMap = await packagingByVariantIds(client, variantIds);
  const referenceMap = await referencesByVariantIds(client, variantIds);
  const rows = provisional.map((row) => {
    const currentPackaging = row.current ? packagingMap.get(row.current.id) || null : null;
    const references = row.current ? referenceMap.get(row.current.id) || null : null;
    const afterOptions = buildOptions(row.current?.options || {}, { ...row.expected, attributeModelVersion: 1 });
    const normalizedCurrentPackaging = currentPackaging ? {
      measureMode: currentPackaging.measureMode,
      sellUnit: lower(currentPackaging.sellUnit),
      packageQuantity: Number(currentPackaging.packageQuantity),
      packageUnit: lower(currentPackaging.packageUnit),
      netQuantity: Number(currentPackaging.netQuantity),
      netUnit: lower(currentPackaging.netUnit),
    } : null;
    return {
      ...row,
      pass: row.blockers.length === 0,
      currentPackaging,
      references,
      preserveVariantId: Boolean(row.current),
      preserveImageObjectKey: Boolean(row.current),
      afterOptions,
      changes: row.current ? {
        reparentProduct: row.current.productId !== row.parent?.current?.id,
        sku: upper(row.current.sku) !== upper(row.expected.canonicalSku),
        name: clean(row.current.name) !== row.expected.name,
        price: Number(row.current.shopPrice) !== Number(row.commercial.unitPrice),
        options: stableStringify(afterOptions) !== stableStringify(row.current.options || {}),
        packaging: stableStringify(normalizedCurrentPackaging) !== stableStringify(packagingOf(row.expected)),
        insertLegacyAlias: row.expected.action === "REMAP" && !row.alias,
      } : null,
    };
  });

  const blockedRows = rows.filter((row) => !row.pass);
  const globalBlockers = parentPlans.flatMap((parent) => parent.blockers.map((blocker) => `${parent.productKey}:${blocker}`));
  return {
    pass: blockedRows.length === 0 && globalBlockers.length === 0,
    parents: parentPlans,
    rows,
    summary: {
      rowCount: rows.length,
      updateExistingCount: rows.filter((row) => row.expected.action === "UPDATE_EXISTING").length,
      remapCount: rows.filter((row) => row.expected.action === "REMAP").length,
      createNewCount: 0,
      rowPassCount: rows.length - blockedRows.length,
      rowBlockedCount: blockedRows.length,
      legacyImageTraceCount: rows.filter((row) => row.expected.legacySku).length,
      existingAliasesVerified: rows.filter((row) => row.expected.action === "UPDATE_EXISTING" && row.alias).length,
      variantIdsPreserved: rows.filter((row) => row.preserveVariantId).length,
      imageObjectsPreserved: rows.filter((row) => row.current?.imageObjectKey).length,
      cartItemsPreserved: rows.reduce((sum, row) => sum + Number(row.references?.cartItems || 0), 0),
      orderItemsPreserved: rows.reduce((sum, row) => sum + Number(row.references?.orderItems || 0), 0),
      recipeIngredientsPreserved: rows.reduce((sum, row) => sum + Number(row.references?.recipeIngredients || 0), 0),
      priceRowsPreserved: rows.reduce((sum, row) => sum + Number(row.references?.priceRows || 0), 0),
      globalBlockers,
    },
  };
}

export { PRODUCT_FIELDS, VARIANT_FIELDS, productByKey, variantBySku, aliasesBySku, packagingByVariantIds, referencesByVariantIds, snapshotCorrectionState, buildCorrectionPlan };
