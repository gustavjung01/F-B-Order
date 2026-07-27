import { buildOptions, clean, lower, packagingOf, stableStringify, upper, assert } from "./catalog-remap-batch-common.mjs";
import { buildCorrectionPlan, snapshotCorrectionState, PRODUCT_FIELDS, VARIANT_FIELDS } from "./sinh-to-mut-correction-state.mjs";

function assertCorrectionSchema(client) {
  return client.query(`SELECT
    to_regclass('public.catalog_group_remap_batches')::text AS "batchTable",
    to_regclass('public.catalog_variant_sku_aliases')::text AS "aliasTable",
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='catalog_variant_packaging_specs' AND column_name='measure_mode'
    ) AS "measureMode"`).then((result) => {
    const schema = result.rows[0] || {};
    assert(schema.batchTable && schema.aliasTable, "Correction schema is missing the required batch tables.", "CATALOG_CORRECTION_SCHEMA_MISSING");
    assert(schema.measureMode, "Correction schema is missing measure_mode support.", "CATALOG_CORRECTION_MEASURE_MODE_MISSING");
  });
}

function rowIds(rows, accessor) {
  return [...new Set(rows.map(accessor).filter(Boolean))];
}

async function updateParentProduct(client, manifest, parentPlan) {
  const current = parentPlan.current;
  assert(current, `Target parent ${parentPlan.productKey} is unresolved.`, "CATALOG_CORRECTION_TARGET_PARENT_UNRESOLVED");
  const result = await client.query(
    `UPDATE catalog_products
     SET name=$2, brand=$3, industry=$4, industry_key=$5, catalog_group_key=$6, subcategory=$7, status='active', updated_at=now()
     WHERE id=$1::uuid
     RETURNING ${PRODUCT_FIELDS}`,
    [current.id, parentPlan.name, parentPlan.brand || null, manifest.industryName, manifest.industryKey, manifest.catalogGroupKey, parentPlan.detailGroup],
  );
  return result.rows[0] || null;
}

async function upsertPackaging(client, variantId, manifest, payload, expected, commercial) {
  const pack = packagingOf(expected);
  await client.query(
    `INSERT INTO catalog_variant_packaging_specs (
      variant_id, sell_unit, package_quantity, package_unit, net_quantity, net_unit, measure_mode,
      conversion_status, source, confidence, source_url, note, verified_by, verified_date, raw_source
    ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,'verified',$8,'high',NULL,$9,'catalog-correction-remap',CURRENT_DATE,$10::jsonb)
    ON CONFLICT (variant_id) DO UPDATE SET
      sell_unit=EXCLUDED.sell_unit,
      package_quantity=EXCLUDED.package_quantity,
      package_unit=EXCLUDED.package_unit,
      net_quantity=EXCLUDED.net_quantity,
      net_unit=EXCLUDED.net_unit,
      measure_mode=EXCLUDED.measure_mode,
      conversion_status=EXCLUDED.conversion_status,
      source=EXCLUDED.source,
      confidence=EXCLUDED.confidence,
      source_url=EXCLUDED.source_url,
      note=EXCLUDED.note,
      verified_by=EXCLUDED.verified_by,
      verified_date=EXCLUDED.verified_date,
      raw_source=EXCLUDED.raw_source,
      updated_at=now()`,
    [
      variantId,
      pack.sellUnit,
      pack.packageQuantity,
      pack.packageUnit,
      pack.netQuantity,
      pack.netUnit,
      pack.measureMode,
      `catalog-correction:${manifest.taskId}`,
      `Correction applied from approved payload ${payload.payloadHash}.`,
      JSON.stringify({
        taskId: manifest.taskId,
        groupKey: manifest.groupKey,
        manifestHash: manifest.manifestHash,
        payloadHash: payload.payloadHash,
        sourceSku: commercial.sku,
        sourceRow: commercial.sourceRow,
        sourceMatchStatus: commercial.sourceMatchStatus,
        unitPrice: commercial.unitPrice,
      }),
    ],
  );
}

async function updateVariantAndRecipes(client, manifest, rowPlan) {
  const { expected, commercial, current, parent } = rowPlan;
  assert(current, `Variant ${expected.canonicalSku} is unresolved.`, "CATALOG_CORRECTION_VARIANT_UNRESOLVED");
  assert(parent?.current, `Parent ${expected.targetParentKey} is unresolved.`, "CATALOG_CORRECTION_PARENT_UNRESOLVED");
  const options = buildOptions(current.options || {}, { ...expected, attributeModelVersion: 1 });
  await client.query(
    `UPDATE catalog_variants
     SET product_id=$2::uuid, sku=$3, name=$4, options=$5::jsonb, price_mode='fixed', shop_price=$6,
         status='active', is_active=true, is_public=true, is_orderable=true, updated_at=now()
     WHERE id=$1::uuid`,
    [current.id, parent.current.id, expected.canonicalSku, expected.name, JSON.stringify(options), commercial.unitPrice],
  );
  await client.query(
    `UPDATE recipe_ingredients
     SET catalog_product_id=$2::uuid,
         catalog_snapshot=COALESCE(catalog_snapshot,'{}'::jsonb) || jsonb_build_object(
           'variantId',$1::text,
           'productId',$2::text,
           'sku',$3::text,
           'productName',$4::text,
           'variantName',$5::text
         )
     WHERE catalog_variant_id=$1::uuid`,
    [current.id, parent.current.id, expected.canonicalSku, parent.current.name, expected.name],
  );
  return current.id;
}

async function upsertAlias(client, manifest, legacySku, variantId) {
  if (!legacySku) return;
  await client.query(
    `INSERT INTO catalog_variant_sku_aliases (alias_sku, variant_id, source)
     VALUES ($1, $2::uuid, $3)
     ON CONFLICT (alias_sku) DO UPDATE SET
       variant_id = EXCLUDED.variant_id,
       source = CASE
         WHEN catalog_variant_sku_aliases.variant_id = EXCLUDED.variant_id THEN catalog_variant_sku_aliases.source
         ELSE EXCLUDED.source
       END`,
    [legacySku, variantId, `catalog-correction:${manifest.taskId}`],
  );
}

async function verifyAppliedCorrection(client, manifest, payload, plan) {
  const canonicalSkus = manifest.rows.map((row) => upper(row.canonicalSku));
  const legacySkus = manifest.rows.map((row) => row.legacySku).filter(Boolean);
  const variantResult = await client.query(
    `SELECT
       product.id::text AS "productId",
       product.product_key AS "productKey",
       product.name AS "productName",
       product.brand,
       product.industry_key AS "industryKey",
       product.catalog_group_key AS "catalogGroupKey",
       product.subcategory,
       variant.id::text AS "variantId",
       variant.variant_key AS "variantKey",
       variant.sku,
       variant.name AS "variantName",
       variant.options,
       variant.shop_price::float8 AS "shopPrice",
       variant.price_mode AS "priceMode",
       variant.status AS "variantStatus",
       variant.is_active AS "isActive",
       variant.is_public AS "isPublic",
       variant.is_orderable AS "isOrderable",
       variant.image_key AS "imageKey",
       variant.image_object_key AS "imageObjectKey",
       packaging.sell_unit AS "packagingSellUnit",
       packaging.package_quantity::float8 AS "packagingPackageQuantity",
       packaging.package_unit AS "packagingPackageUnit",
       packaging.net_quantity::float8 AS "packagingNetQuantity",
       packaging.net_unit AS "packagingNetUnit",
       packaging.measure_mode AS "packagingMeasureMode"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     LEFT JOIN catalog_variant_packaging_specs packaging ON packaging.variant_id = variant.id
     WHERE UPPER(variant.sku) = ANY($1::text[])
     ORDER BY UPPER(variant.sku)`,
    [canonicalSkus],
  );
  assert(variantResult.rows.length === manifest.rows.length, `Expected ${manifest.rows.length} canonical variants after apply, found ${variantResult.rows.length}.`, "CATALOG_CORRECTION_VERIFY_VARIANT_COUNT");
  const bySku = new Map(variantResult.rows.map((row) => [upper(row.sku), row]));

  const aliasResult = legacySkus.length
    ? await client.query(
      `SELECT UPPER(alias.alias_sku) AS "aliasSku", alias.variant_id::text AS "variantId", UPPER(variant.sku) AS "canonicalSku"
       FROM catalog_variant_sku_aliases alias
       JOIN catalog_variants variant ON variant.id = alias.variant_id
       WHERE UPPER(alias.alias_sku) = ANY($1::text[])`,
      [legacySkus.map(upper)],
    )
    : { rows: [] };
  const aliasBySku = new Map(aliasResult.rows.map((row) => [row.aliasSku, row]));

  let recipeMismatchCount = 0;
  const variantIds = variantResult.rows.map((row) => row.variantId);
  if (variantIds.length) {
    const recipeResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM recipe_ingredients ingredient
       JOIN catalog_variants variant ON variant.id = ingredient.catalog_variant_id
       WHERE ingredient.catalog_variant_id = ANY($1::uuid[])
         AND (
           ingredient.catalog_product_id IS DISTINCT FROM variant.product_id
           OR ingredient.catalog_snapshot->>'variantId' IS DISTINCT FROM variant.id::text
           OR ingredient.catalog_snapshot->>'productId' IS DISTINCT FROM variant.product_id::text
           OR UPPER(ingredient.catalog_snapshot->>'sku') IS DISTINCT FROM UPPER(variant.sku)
           OR ingredient.catalog_snapshot->>'variantName' IS DISTINCT FROM variant.name
         )`,
      [variantIds],
    );
    recipeMismatchCount = Number(recipeResult.rows[0]?.count || 0);
  }

  const parentKeys = [...new Set(manifest.parents.map((parent) => parent.productKey))];
  const parentResult = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM catalog_products
     WHERE product_key = ANY($1::text[]) AND status = 'active'`,
    [parentKeys],
  );
  const activeParentCount = Number(parentResult.rows[0]?.count || 0);

  const plannedBySku = new Map((plan?.rows || []).map((row) => [upper(row.expected.canonicalSku), row]));
  const rows = manifest.rows.map((expected) => {
    const current = bySku.get(upper(expected.canonicalSku)) || null;
    const alias = expected.legacySku ? aliasBySku.get(upper(expected.legacySku)) || null : null;
    const commercial = payload.rows.find((row) => upper(row.sku) === upper(expected.canonicalSku)) || null;
    const planned = plannedBySku.get(upper(expected.canonicalSku)) || null;
    assert(current, `Canonical SKU ${expected.canonicalSku} is missing after apply.`, "CATALOG_CORRECTION_VERIFY_SKU_MISSING");
    const expectedOptions = planned?.afterOptions || buildOptions({}, { ...expected, attributeModelVersion: 1 });
    const pack = packagingOf(expected);
    assert(current.priceMode === "fixed" && current.variantStatus === "active" && current.isActive && current.isPublic && current.isOrderable, `Canonical SKU ${expected.canonicalSku} is not active/orderable fixed-price.`, "CATALOG_CORRECTION_VERIFY_VARIANT_STATE");
    assert(clean(current.productKey) === clean(expected.targetParentKey), `Product key mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_PARENT_KEY");
    assert(clean(current.productName) === clean(manifest.targetParents[expected.detailGroup]?.name), `Product name mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_PARENT_NAME");
    assert(clean(current.brand) === clean(manifest.targetParents[expected.detailGroup]?.brand), `Brand mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_BRAND");
    assert(clean(current.industryKey) === clean(manifest.industryKey), `Industry key mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_INDUSTRY");
    assert(clean(current.catalogGroupKey) === clean(manifest.catalogGroupKey), `Catalog group mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_GROUP");
    assert(clean(current.subcategory) === clean(expected.detailGroup), `Detail group mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_DETAIL_GROUP");
    assert(upper(current.options?.type) === upper(expected.productType), `Type split mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_TYPE");
    assert(upper(current.options?.flavor) === upper(expected.flavor), `Flavor split mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_FLAVOR");
    assert(clean(current.options?.measure_kind) === "mass", `Measure kind mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_MEASURE_KIND");
    assert(stableStringify(current.options || {}) === stableStringify(expectedOptions), `Option payload mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_OPTIONS");
    assert(Number(current.shopPrice) === Number(commercial?.unitPrice || 0), `Price mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_PRICE");
    assert(current.packagingMeasureMode === pack.measureMode, `Measure mode mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_PACKAGING_MODE");
    assert(lower(current.packagingSellUnit) === pack.sellUnit && Number(current.packagingPackageQuantity) === Number(pack.packageQuantity) && lower(current.packagingPackageUnit) === pack.packageUnit && Number(current.packagingNetQuantity) === Number(pack.netQuantity) && lower(current.packagingNetUnit) === pack.netUnit, `Packaging mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_PACKAGING");
    if (expected.legacySku) {
      assert(alias && alias.variantId === current.variantId && alias.canonicalSku === upper(expected.canonicalSku), `Legacy alias ${expected.legacySku} does not resolve to ${expected.canonicalSku}.`, "CATALOG_CORRECTION_VERIFY_ALIAS");
    }
    return {
      canonicalSku: expected.canonicalSku,
      variantId: current.variantId,
      legacySku: expected.legacySku || null,
      action: expected.action,
      preserveVariantId: true,
      typeMatches: upper(current.options?.type) === upper(expected.productType),
      flavorMatches: upper(current.options?.flavor) === upper(expected.flavor),
      priceMatches: Number(current.shopPrice) === Number(commercial?.unitPrice || 0),
      packagingMatches: lower(current.packagingSellUnit) === pack.sellUnit && Number(current.packagingPackageQuantity) === Number(pack.packageQuantity) && lower(current.packagingPackageUnit) === pack.packageUnit && Number(current.packagingNetQuantity) === Number(pack.netQuantity) && lower(current.packagingNetUnit) === pack.netUnit,
    };
  });

  return {
    canonicalVariantCount: variantResult.rows.length,
    updateExistingCount: rows.filter((row) => row.action === "UPDATE_EXISTING").length,
    remapCount: rows.filter((row) => row.action === "REMAP").length,
    createNewCount: 0,
    updateExistingVariantIdsPreservedCount: rows.filter((row) => row.action === "UPDATE_EXISTING" && row.preserveVariantId).length,
    remapAliasCount: rows.filter((row) => row.action === "REMAP" && legacySkus.includes(row.legacySku)).length,
    typeFlavorSplitCount: rows.filter((row) => row.typeMatches && row.flavorMatches).length,
    priceMatchCount: rows.filter((row) => row.priceMatches).length,
    packagingMatchCount: rows.filter((row) => row.packagingMatches).length,
    aliasCount: aliasResult.rows.length,
    recipeMismatchCount,
    activeParentCount,
    rows,
  };
}

async function applyTask(client, manifest, payload) {
  await assertCorrectionSchema(client);
  const plan = await buildCorrectionPlan(client, manifest, payload, { lock: true });
  assert(plan.pass, `Task ${manifest.taskId} has blockers.`, "CATALOG_CORRECTION_APPLY_BLOCKED", { summary: plan.summary, rows: plan.rows.filter((row) => !row.pass).map((row) => ({ canonicalSku: row.expected.canonicalSku, blockers: row.blockers })) });
  assert(plan.summary.rowCount === 25 && plan.summary.updateExistingCount === 23 && plan.summary.remapCount === 2 && plan.summary.createNewCount === 0, "Correction task scope is invalid.", "CATALOG_CORRECTION_SCOPE_INVALID", plan.summary);
  const already = await client.query(`SELECT id::text FROM catalog_group_remap_batches WHERE manifest_hash=$1 AND status='applied' LIMIT 1`, [manifest.manifestHash]);
  assert(!already.rows[0], `Task ${manifest.taskId} is already applied.`, "CATALOG_CORRECTION_ALREADY_APPLIED", { batchId: already.rows[0]?.id });

  const sourceProductIds = rowIds(plan.rows, (row) => row.current?.productId);
  const targetProductIds = rowIds(plan.parents, (parent) => parent.current?.id);
  const sourceVariantIds = rowIds(plan.rows, (row) => row.current?.id);
  const legacySkus = plan.rows.map((row) => row.expected.legacySku).filter(Boolean);
  const before = await snapshotCorrectionState(client, {
    productIds: [...sourceProductIds, ...targetProductIds],
    variantIds: sourceVariantIds,
    legacySkus,
  });
  const batchResult = await client.query(
    `INSERT INTO catalog_group_remap_batches (
      task_id, group_key, manifest_hash, status, row_count, before_snapshot, summary
    ) VALUES ($1, $2, $3, 'applying', $4, $5::jsonb, $6::jsonb)
    RETURNING id::text AS "id"`,
    [
      manifest.taskId,
      manifest.groupKey,
      manifest.manifestHash,
      manifest.rows.length,
      JSON.stringify(before),
      JSON.stringify({
        ...plan.summary,
        payloadHash: payload.payloadHash,
        payloadHashProfile: payload.hashProfile,
        sourceProductIds,
        targetProductIds,
        sourceVariantIds,
      }),
    ],
  );
  const batchId = batchResult.rows[0].id;

  const parentByKey = new Map();
  for (const parentPlan of plan.parents) {
    parentByKey.set(parentPlan.productKey, await updateParentProduct(client, manifest, parentPlan));
  }

  const affectedVariantIds = [];
  for (const rowPlan of plan.rows) {
    const variantId = await updateVariantAndRecipes(client, manifest, rowPlan);
    affectedVariantIds.push(variantId);
    if (rowPlan.expected.legacySku) await upsertAlias(client, manifest, rowPlan.expected.legacySku, variantId);
    await upsertPackaging(client, variantId, manifest, payload, rowPlan.expected, rowPlan.commercial);
  }

  const after = await snapshotCorrectionState(client, {
    productIds: [...sourceProductIds, ...targetProductIds],
    variantIds: affectedVariantIds,
    legacySkus,
  });
  await client.query(
    `UPDATE catalog_group_remap_batches
     SET status='applied', after_snapshot=$2::jsonb, summary=$3::jsonb, applied_at=now()
     WHERE id=$1::uuid`,
    [
      batchId,
      JSON.stringify(after),
      JSON.stringify({
        ...plan.summary,
        payloadHash: payload.payloadHash,
        payloadHashProfile: payload.hashProfile,
        affectedProductIds: [...new Set([...sourceProductIds, ...targetProductIds])],
        affectedVariantIds,
      }),
    ],
  );

  const verification = await verifyAppliedCorrection(client, manifest, payload, plan);
  return {
    batchId,
    taskId: manifest.taskId,
    manifestHash: manifest.manifestHash,
    payloadHash: payload.payloadHash,
    rowCount: manifest.rows.length,
    summary: plan.summary,
    verification,
  };
}

async function restorePackaging(client, item) {
  if (!item) return;
  await client.query(
    `INSERT INTO catalog_variant_packaging_specs (
      variant_id, sell_unit, package_quantity, package_unit, net_quantity, net_unit, measure_mode,
      conversion_status, source, confidence, source_url, note, verified_by, verified_date, raw_source, created_at, updated_at
    ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15::jsonb,$16::timestamptz,$17::timestamptz)
    ON CONFLICT (variant_id) DO UPDATE SET
      sell_unit=EXCLUDED.sell_unit,
      package_quantity=EXCLUDED.package_quantity,
      package_unit=EXCLUDED.package_unit,
      net_quantity=EXCLUDED.net_quantity,
      net_unit=EXCLUDED.net_unit,
      measure_mode=EXCLUDED.measure_mode,
      conversion_status=EXCLUDED.conversion_status,
      source=EXCLUDED.source,
      confidence=EXCLUDED.confidence,
      source_url=EXCLUDED.source_url,
      note=EXCLUDED.note,
      verified_by=EXCLUDED.verified_by,
      verified_date=EXCLUDED.verified_date,
      raw_source=EXCLUDED.raw_source,
      created_at=EXCLUDED.created_at,
      updated_at=EXCLUDED.updated_at`,
    [
      item.variantId,
      item.sellUnit,
      item.packageQuantity,
      item.packageUnit,
      item.netQuantity,
      item.netUnit,
      item.measureMode,
      item.conversionStatus,
      item.source,
      item.confidence,
      item.sourceUrl,
      item.note,
      item.verifiedBy,
      item.verifiedDate,
      JSON.stringify(item.rawSource || {}),
      item.createdAt,
      item.updatedAt,
    ],
  );
}

async function rollbackTask(client, batchId) {
  assert(/^[0-9a-f-]{36}$/i.test(batchId), "Rollback batch ID is invalid.", "CATALOG_CORRECTION_ROLLBACK_ID_INVALID");
  const result = await client.query(
    `SELECT id::text, task_id AS "taskId", group_key AS "groupKey", manifest_hash AS "manifestHash", status, before_snapshot AS "beforeSnapshot", after_snapshot AS "afterSnapshot", summary
     FROM catalog_group_remap_batches
     WHERE id=$1::uuid
     FOR UPDATE`,
    [batchId],
  );
  const batch = result.rows[0];
  assert(batch && batch.taskId === "SINH-TO-MUT-CORRECTION-01" && batch.status === "applied", "Only an applied SINH-TO-MUT-CORRECTION-01 batch can be rolled back.", "CATALOG_CORRECTION_ROLLBACK_BATCH_INVALID", batch || null);
  const affectedProductIds = Array.isArray(batch.summary?.affectedProductIds) ? batch.summary.affectedProductIds.map(String) : [];
  if (affectedProductIds.length) {
    const dependency = await client.query(
      `SELECT id::text, task_id AS "taskId"
       FROM catalog_group_remap_batches
       WHERE id<>$1::uuid
         AND status='applied'
         AND applied_at>(SELECT applied_at FROM catalog_group_remap_batches WHERE id=$1::uuid)
         AND COALESCE(summary->'affectedProductIds','[]'::jsonb) ?| $2::text[]
       ORDER BY applied_at
       LIMIT 1`,
      [batchId, affectedProductIds],
    );
    assert(!dependency.rows[0], `Rollback ${batch.taskId} is blocked by later applied task ${dependency.rows[0]?.taskId}.`, "CATALOG_CORRECTION_ROLLBACK_DEPENDENCY", dependency.rows[0] || null);
  }
  const before = batch.beforeSnapshot;
  const after = batch.afterSnapshot;
  const current = await snapshotCorrectionState(client, {
    productIds: after.products.map((item) => item.id),
    variantIds: after.variants.map((item) => item.id),
    legacySkus: after.aliases.map((item) => item.aliasSku),
  });
  assert(stableStringify(current) === stableStringify(after), "Current catalog state diverged from the batch after-snapshot. Rollback refused.", "CATALOG_CORRECTION_ROLLBACK_STATE_DIVERGED");

  const beforeVariantIds = new Set(before.variants.map((item) => item.id));
  const createdVariants = after.variants.filter((item) => !beforeVariantIds.has(item.id));
  for (const item of createdVariants) await client.query(`DELETE FROM catalog_variants WHERE id=$1::uuid`, [item.id]);

  const beforeRecipeByVariant = new Map();
  for (const recipe of before.recipes) beforeRecipeByVariant.set(recipe.variantId, [...(beforeRecipeByVariant.get(recipe.variantId) || []), recipe]);
  for (const item of before.variants) {
    const recipeRows = beforeRecipeByVariant.get(item.id) || [];
    await client.query(
      `WITH restored AS (
        UPDATE catalog_variants
        SET product_id=$2::uuid, catalog_version=$3, variant_key=$4, sku=$5, name=$6, options=$7::jsonb, price_mode=$8,
            shop_price=$9, image_key=$10, image_object_key=$11, status=$12, is_active=$13, is_public=$14, is_orderable=$15,
            sort_order=$16, updated_at=now()
        WHERE id=$1::uuid
        RETURNING id
      ), recipe_values AS (
        SELECT x.id::uuid AS id, x."productId"::uuid AS product_id, x.snapshot
        FROM jsonb_to_recordset($17::jsonb) AS x(id text, "productId" text, snapshot jsonb)
      )
      UPDATE recipe_ingredients ingredient
      SET catalog_product_id=recipe_values.product_id, catalog_snapshot=recipe_values.snapshot
      FROM restored, recipe_values
      WHERE ingredient.id=recipe_values.id AND ingredient.catalog_variant_id=restored.id`,
      [
        item.id,
        item.productId,
        item.catalogVersion,
        item.variantKey,
        item.sku,
        item.name,
        JSON.stringify(item.options || {}),
        item.priceMode,
        item.shopPrice,
        item.imageKey,
        item.imageObjectKey,
        item.status,
        item.isActive,
        item.isPublic,
        item.isOrderable,
        item.sortOrder,
        JSON.stringify(recipeRows),
      ],
    );
  }

  const beforePack = new Map(before.packaging.map((item) => [item.variantId, item]));
  for (const item of before.variants) {
    if (beforePack.has(item.id)) await restorePackaging(client, beforePack.get(item.id));
    else await client.query(`DELETE FROM catalog_variant_packaging_specs WHERE variant_id=$1::uuid`, [item.id]);
  }

  const affectedAliases = after.aliases.map((item) => item.aliasSku);
  if (affectedAliases.length) await client.query(`DELETE FROM catalog_variant_sku_aliases WHERE UPPER(alias_sku)=ANY($1::text[])`, [affectedAliases.map(upper)]);
  for (const alias of before.aliases) await client.query(`INSERT INTO catalog_variant_sku_aliases (alias_sku, variant_id, source, created_at) VALUES ($1,$2::uuid,$3,$4::timestamptz)`, [alias.aliasSku, alias.variantId, alias.source, alias.createdAt]);

  for (const item of before.products) {
    await client.query(
      `UPDATE catalog_products
       SET catalog_version=$2, product_key=$3, name=$4, brand=$5, industry=$6, industry_key=$7, catalog_group_key=$8,
           subcategory=$9, source_group=$10, option_groups=$11::jsonb, choice_groups=$12::jsonb, cover_image_key=$13,
           cover_image_object_key=$14, status=$15, sort_order=$16, updated_at=now()
       WHERE id=$1::uuid`,
      [
        item.id,
        item.catalogVersion,
        item.productKey,
        item.name,
        item.brand,
        item.industry,
        item.industryKey,
        item.catalogGroupKey,
        item.subcategory,
        item.sourceGroup,
        JSON.stringify(item.optionGroups || []),
        JSON.stringify(item.choiceGroups || []),
        item.coverImageKey,
        item.coverImageObjectKey,
        item.status,
        item.sortOrder,
      ],
    );
  }
  const beforeProductIds = new Set(before.products.map((item) => item.id));
  for (const item of after.products.filter((product) => !beforeProductIds.has(product.id))) {
    await client.query(`DELETE FROM catalog_products WHERE id=$1::uuid AND NOT EXISTS (SELECT 1 FROM catalog_variants WHERE product_id=$1::uuid)`, [item.id]);
  }
  await client.query(`UPDATE catalog_group_remap_batches SET status='rolled_back', rolled_back_at=now() WHERE id=$1::uuid`, [batchId]);
  return { batchId, taskId: batch.taskId, restoredVariants: before.variants.length, deletedCreatedVariants: createdVariants.length };
}

export { assertCorrectionSchema, applyTask, rollbackTask, verifyAppliedCorrection };
