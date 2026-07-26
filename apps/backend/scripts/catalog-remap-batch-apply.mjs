import { assert, clean, upper, lower, stableStringify, packagingOf, buildOptions } from "./catalog-remap-batch-common.mjs";
import { PRODUCT_FIELDS, assertSchema, snapshotState, buildPlan } from "./catalog-remap-batch-state.mjs";

async function upsertPackaging(client, variantId, manifest, payload, row, commercial) {
  const pack = packagingOf(row);
  await client.query(`INSERT INTO catalog_variant_packaging_specs (
    variant_id, sell_unit, package_quantity, package_unit, net_quantity, net_unit, measure_mode,
    conversion_status, source, confidence, source_url, note, verified_by, verified_date, raw_source
  ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,'verified',$8,'high',NULL,$9,'catalog-remap-batch-apply',CURRENT_DATE,$10::jsonb)
  ON CONFLICT (variant_id) DO UPDATE SET sell_unit=EXCLUDED.sell_unit, package_quantity=EXCLUDED.package_quantity,
    package_unit=EXCLUDED.package_unit, net_quantity=EXCLUDED.net_quantity, net_unit=EXCLUDED.net_unit,
    measure_mode=EXCLUDED.measure_mode, conversion_status=EXCLUDED.conversion_status, source=EXCLUDED.source,
    confidence=EXCLUDED.confidence, source_url=EXCLUDED.source_url, note=EXCLUDED.note,
    verified_by=EXCLUDED.verified_by, verified_date=EXCLUDED.verified_date, raw_source=EXCLUDED.raw_source, updated_at=now()`, [
    variantId, pack.sellUnit, pack.packageQuantity, pack.packageUnit, pack.netQuantity, pack.netUnit, pack.measureMode,
    `catalog-remap:${manifest.taskId}`,
    "Applied from an approved private catalog remap payload. Outer price remains reference-only.",
    JSON.stringify({ taskId: manifest.taskId, groupKey: manifest.groupKey, manifestHash: manifest.manifestHash, payloadHash: payload.payloadHash, sourceKey: payload.sourceKey, sourceRow: commercial.sourceRow, sourceMatchStatus: commercial.sourceMatchStatus, measureMode: pack.measureMode, derivedPackagePrice: commercial.derivedPackagePrice }),
  ]);
}

async function updateVariantAndRecipes(client, current, targetProduct, expected, commercial) {
  const options = buildOptions(current.options, expected);
  const result = await client.query(`WITH moved AS (
    UPDATE catalog_variants SET product_id=$2::uuid, sku=$3, name=$4, options=$5::jsonb, shop_price=$6, updated_at=now()
    WHERE id=$1::uuid RETURNING id
  )
  UPDATE recipe_ingredients ingredient SET catalog_product_id=$2::uuid,
    catalog_snapshot=COALESCE(ingredient.catalog_snapshot,'{}'::jsonb) || jsonb_build_object(
      'variantId',$1::text,'productId',$2::text,'sku',$3,'productName',$7::text,'variantName',$4
    )
  FROM moved WHERE ingredient.catalog_variant_id=moved.id
  RETURNING ingredient.id::text`, [current.id, targetProduct.id, expected.canonicalSku, expected.name, JSON.stringify(options), commercial.unitPrice, targetProduct.name]);
  return result.rowCount;
}

async function createVariant(client, targetProduct, expected, commercial) {
  const sort = await client.query(`SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM catalog_variants WHERE product_id=$1::uuid`, [targetProduct.id]);
  const variantKey = `${expected.targetParentKey}-${lower(expected.canonicalSku).replace(/[^a-z0-9]+/g, "-")}`;
  const result = await client.query(`INSERT INTO catalog_variants (
    product_id,catalog_version,variant_key,sku,name,options,price_mode,price_label,retail_price,shop_price,
    image_key,image_object_key,status,is_active,is_public,is_orderable,sort_order
  ) VALUES ($1::uuid,'hung-phat-v2',$2,$3,$4,$5::jsonb,'fixed',NULL,NULL,$6,$7,NULL,'active',true,true,true,$8)
  RETURNING id::text AS "id"`, [targetProduct.id, variantKey, expected.canonicalSku, expected.name, JSON.stringify(buildOptions({}, expected)), commercial.unitPrice, lower(expected.canonicalSku), Number(sort.rows[0]?.next) || 0]);
  return result.rows[0].id;
}

async function ensureParent(client, manifest, parentPlan) {
  if (parentPlan.createProduct) {
    const sort = await client.query(`SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM catalog_products WHERE industry_key=$1 AND catalog_group_key=$2`, [manifest.industryKey, manifest.catalogGroupKey]);
    const result = await client.query(`INSERT INTO catalog_products (
      catalog_version,product_key,name,brand,industry,industry_key,catalog_group_key,subcategory,source_group,
      option_groups,choice_groups,status,sort_order
    ) VALUES ('hung-phat-v2',$1,$2,$3,$4,$5,$6,$7,$8,'[]'::jsonb,'[]'::jsonb,'active',$9)
    RETURNING ${PRODUCT_FIELDS}`, [parentPlan.productKey, parentPlan.name, parentPlan.brand || null, manifest.industryName, manifest.industryKey, manifest.catalogGroupKey, parentPlan.detailGroup, manifest.catalogGroupName, Number(sort.rows[0]?.next) || 0]);
    return result.rows[0];
  }
  const target = parentPlan.targetProduct;
  assert(target, `Target parent ${parentPlan.productKey} is unresolved.`, "CATALOG_REMAP_TARGET_PARENT_UNRESOLVED");
  const result = await client.query(`UPDATE catalog_products SET product_key=$2,name=$3,brand=$4,industry=$5,industry_key=$6,catalog_group_key=$7,subcategory=$8,status='active',updated_at=now() WHERE id=$1::uuid RETURNING ${PRODUCT_FIELDS}`, [target.id, parentPlan.productKey, parentPlan.name, parentPlan.brand || null, manifest.industryName, manifest.industryKey, manifest.catalogGroupKey, parentPlan.detailGroup]);
  return result.rows[0];
}

async function applyTask(client, manifest, payload) {
  await assertSchema(client);
  const plan = await buildPlan(client, manifest, payload, { lock: true });
  assert(plan.pass, `Task ${manifest.taskId} has blockers.`, "CATALOG_REMAP_APPLY_BLOCKED", { summary: plan.summary, rows: plan.rows.filter((row) => !row.pass).map((row) => ({ canonicalSku: row.expected.canonicalSku, blockers: row.blockers })) });
  const already = await client.query(`SELECT id::text FROM catalog_group_remap_batches WHERE manifest_hash=$1 AND status='applied' LIMIT 1`, [manifest.manifestHash]);
  assert(!already.rows[0], `Task ${manifest.taskId} is already applied.`, "CATALOG_REMAP_ALREADY_APPLIED", { batchId: already.rows[0]?.id });

  const sourceProductIds = plan.rows.filter((row) => row.current).map((row) => row.current.productId);
  const sourceVariantIds = plan.rows.filter((row) => row.current).map((row) => row.current.id);
  const targetProductIds = plan.parents.map((parent) => parent.targetProduct?.id).filter(Boolean);
  const legacySkus = plan.rows.filter((row) => row.expected.action === "REMAP").map((row) => row.expected.legacySku);
  const before = await snapshotState(client, { productIds: [...sourceProductIds, ...targetProductIds], variantIds: sourceVariantIds, legacySkus });
  const batchResult = await client.query(`INSERT INTO catalog_group_remap_batches (task_id,group_key,manifest_hash,status,row_count,before_snapshot,summary) VALUES ($1,$2,$3,'applying',$4,$5::jsonb,$6::jsonb) RETURNING id::text AS "id"`, [manifest.taskId, manifest.groupKey, manifest.manifestHash, manifest.rows.length, JSON.stringify(before), JSON.stringify({ ...plan.summary, payloadHash: payload.payloadHash, payloadHashProfile: payload.hashProfile })]);
  const batchId = batchResult.rows[0].id;

  const parentByKey = new Map();
  for (const parentPlan of plan.parents) parentByKey.set(parentPlan.productKey, await ensureParent(client, manifest, parentPlan));
  const affectedVariantIds = [];
  for (const rowPlan of plan.rows) {
    const { expected, commercial, current } = rowPlan;
    const targetProduct = parentByKey.get(expected.targetParentKey);
    let variantId;
    if (expected.action === "REMAP") {
      await updateVariantAndRecipes(client, current, targetProduct, expected, commercial);
      variantId = current.id;
      await client.query(`INSERT INTO catalog_variant_sku_aliases (alias_sku,variant_id,source) VALUES ($1,$2::uuid,$3) ON CONFLICT (alias_sku) DO UPDATE SET variant_id=EXCLUDED.variant_id,source=EXCLUDED.source`, [expected.legacySku, variantId, `catalog-remap:${manifest.taskId}`]);
    } else {
      variantId = await createVariant(client, targetProduct, expected, commercial);
    }
    await upsertPackaging(client, variantId, manifest, payload, expected, commercial);
    affectedVariantIds.push(variantId);
  }

  const targetIds = [...new Set([...parentByKey.values()].map((product) => product.id))];
  const sourceOnly = [...new Set(sourceProductIds.filter((id) => !targetIds.includes(id)))];
  for (const productId of sourceOnly) {
    await client.query(`UPDATE catalog_products product SET status='inactive',updated_at=now() WHERE id=$1::uuid AND NOT EXISTS (SELECT 1 FROM catalog_variants variant WHERE variant.product_id=product.id AND variant.is_active AND variant.is_public AND variant.status IN ('active','market_price'))`, [productId]);
  }

  const after = await snapshotState(client, { productIds: [...sourceProductIds, ...targetIds], variantIds: affectedVariantIds, legacySkus });
  await client.query(`UPDATE catalog_group_remap_batches SET status='applied',after_snapshot=$2::jsonb,summary=$3::jsonb,applied_at=now() WHERE id=$1::uuid`, [batchId, JSON.stringify(after), JSON.stringify({ ...plan.summary, payloadHash: payload.payloadHash, payloadHashProfile: payload.hashProfile, affectedProductIds: [...new Set([...sourceProductIds, ...targetIds])], affectedVariantIds })]);
  return { batchId, taskId: manifest.taskId, manifestHash: manifest.manifestHash, payloadHash: payload.payloadHash, rowCount: manifest.rows.length };
}

async function restorePackaging(client, item) {
  if (!item) return;
  await client.query(`INSERT INTO catalog_variant_packaging_specs (variant_id,sell_unit,package_quantity,package_unit,net_quantity,net_unit,measure_mode,conversion_status,source,confidence,source_url,note,verified_by,verified_date,raw_source,created_at,updated_at) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15::jsonb,$16::timestamptz,$17::timestamptz) ON CONFLICT (variant_id) DO UPDATE SET sell_unit=EXCLUDED.sell_unit,package_quantity=EXCLUDED.package_quantity,package_unit=EXCLUDED.package_unit,net_quantity=EXCLUDED.net_quantity,net_unit=EXCLUDED.net_unit,measure_mode=EXCLUDED.measure_mode,conversion_status=EXCLUDED.conversion_status,source=EXCLUDED.source,confidence=EXCLUDED.confidence,source_url=EXCLUDED.source_url,note=EXCLUDED.note,verified_by=EXCLUDED.verified_by,verified_date=EXCLUDED.verified_date,raw_source=EXCLUDED.raw_source,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`, [item.variantId,item.sellUnit,item.packageQuantity,item.packageUnit,item.netQuantity,item.netUnit,item.measureMode,item.conversionStatus,item.source,item.confidence,item.sourceUrl,item.note,item.verifiedBy,item.verifiedDate,JSON.stringify(item.rawSource || {}),item.createdAt,item.updatedAt]);
}

async function rollbackTask(client, batchId) {
  assert(/^[0-9a-f-]{36}$/i.test(batchId), "Rollback batch ID is invalid.", "CATALOG_REMAP_ROLLBACK_ID_INVALID");
  const result = await client.query(`SELECT id::text,task_id AS "taskId",group_key AS "groupKey",manifest_hash AS "manifestHash",status,before_snapshot AS "beforeSnapshot",after_snapshot AS "afterSnapshot",summary FROM catalog_group_remap_batches WHERE id=$1::uuid FOR UPDATE`, [batchId]);
  const batch = result.rows[0];
  assert(batch && batch.status === "applied", "Only an applied catalog remap batch can be rolled back.", "CATALOG_REMAP_ROLLBACK_BATCH_INVALID");
  const affectedProductIds = Array.isArray(batch.summary?.affectedProductIds) ? batch.summary.affectedProductIds.map(String) : [];
  if (affectedProductIds.length) {
    const dependency = await client.query(`SELECT id::text,task_id AS "taskId" FROM catalog_group_remap_batches WHERE id<>$1::uuid AND status='applied' AND applied_at>(SELECT applied_at FROM catalog_group_remap_batches WHERE id=$1::uuid) AND COALESCE(summary->'affectedProductIds','[]'::jsonb) ?| $2::text[] ORDER BY applied_at LIMIT 1`, [batchId, affectedProductIds]);
    assert(!dependency.rows[0], `Rollback ${batch.taskId} is blocked by later applied task ${dependency.rows[0]?.taskId}.`, "CATALOG_REMAP_ROLLBACK_DEPENDENCY", dependency.rows[0]);
  }
  const after = batch.afterSnapshot;
  const current = await snapshotState(client, { productIds: after.products.map((item) => item.id), variantIds: after.variants.map((item) => item.id), legacySkus: after.aliases.map((item) => item.aliasSku) });
  assert(stableStringify(current) === stableStringify(after), "Current catalog state diverged from the batch after-snapshot. Rollback refused.", "CATALOG_REMAP_ROLLBACK_STATE_DIVERGED");
  const before = batch.beforeSnapshot;
  const beforeVariantIds = new Set(before.variants.map((item) => item.id));
  const createdVariants = after.variants.filter((item) => !beforeVariantIds.has(item.id));
  for (const item of createdVariants) await client.query(`DELETE FROM catalog_variants WHERE id=$1::uuid`, [item.id]);

  const beforeRecipeByVariant = new Map();
  for (const recipe of before.recipes) beforeRecipeByVariant.set(recipe.variantId, [...(beforeRecipeByVariant.get(recipe.variantId) || []), recipe]);
  for (const item of before.variants) {
    const recipeRows = beforeRecipeByVariant.get(item.id) || [];
    await client.query(`WITH restored AS (
      UPDATE catalog_variants SET product_id=$2::uuid,catalog_version=$3,variant_key=$4,sku=$5,name=$6,options=$7::jsonb,price_mode=$8,price_label=$9,retail_price=$10,shop_price=$11,image_key=$12,image_object_key=$13,status=$14,is_active=$15,is_public=$16,is_orderable=$17,sort_order=$18,updated_at=now() WHERE id=$1::uuid RETURNING id
    ), recipe_values AS (
      SELECT x.id::uuid AS id, x."productId"::uuid AS product_id, x.snapshot
      FROM jsonb_to_recordset($19::jsonb) AS x(id text, "productId" text, snapshot jsonb)
    )
    UPDATE recipe_ingredients ingredient SET catalog_product_id=recipe_values.product_id,catalog_snapshot=recipe_values.snapshot
    FROM restored,recipe_values WHERE ingredient.id=recipe_values.id AND ingredient.catalog_variant_id=restored.id`, [item.id,item.productId,item.catalogVersion,item.variantKey,item.sku,item.name,JSON.stringify(item.options || {}),item.priceMode,item.priceLabel,item.retailPrice,item.shopPrice,item.imageKey,item.imageObjectKey,item.status,item.isActive,item.isPublic,item.isOrderable,item.sortOrder,JSON.stringify(recipeRows)]);
  }

  const beforePack = new Map(before.packaging.map((item) => [item.variantId, item]));
  for (const item of before.variants) {
    if (beforePack.has(item.id)) await restorePackaging(client, beforePack.get(item.id));
    else await client.query(`DELETE FROM catalog_variant_packaging_specs WHERE variant_id=$1::uuid`, [item.id]);
  }
  const affectedAliases = after.aliases.map((item) => item.aliasSku);
  if (affectedAliases.length) await client.query(`DELETE FROM catalog_variant_sku_aliases WHERE UPPER(alias_sku)=ANY($1::text[])`, [affectedAliases.map(upper)]);
  for (const alias of before.aliases) await client.query(`INSERT INTO catalog_variant_sku_aliases (alias_sku,variant_id,source,created_at) VALUES ($1,$2::uuid,$3,$4::timestamptz)`, [alias.aliasSku,alias.variantId,alias.source,alias.createdAt]);

  for (const item of before.products) {
    await client.query(`UPDATE catalog_products SET catalog_version=$2,product_key=$3,name=$4,brand=$5,industry=$6,industry_key=$7,catalog_group_key=$8,subcategory=$9,source_group=$10,option_groups=$11::jsonb,choice_groups=$12::jsonb,cover_image_key=$13,cover_image_object_key=$14,status=$15,sort_order=$16,updated_at=now() WHERE id=$1::uuid`, [item.id,item.catalogVersion,item.productKey,item.name,item.brand,item.industry,item.industryKey,item.catalogGroupKey,item.subcategory,item.sourceGroup,JSON.stringify(item.optionGroups || []),JSON.stringify(item.choiceGroups || []),item.coverImageKey,item.coverImageObjectKey,item.status,item.sortOrder]);
  }
  const beforeProductIds = new Set(before.products.map((item) => item.id));
  for (const item of after.products.filter((product) => !beforeProductIds.has(product.id))) {
    await client.query(`DELETE FROM catalog_products WHERE id=$1::uuid AND NOT EXISTS (SELECT 1 FROM catalog_variants WHERE product_id=$1::uuid)`, [item.id]);
  }
  await client.query(`UPDATE catalog_group_remap_batches SET status='rolled_back',rolled_back_at=now() WHERE id=$1::uuid`, [batchId]);
  return { batchId, taskId: batch.taskId, restoredVariants: before.variants.length, deletedCreatedVariants: createdVariants.length };
}

export { applyTask, rollbackTask };
