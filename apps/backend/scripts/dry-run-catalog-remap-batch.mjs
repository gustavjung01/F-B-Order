import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
for (const p of [path.join(repoRoot, ".env"), path.resolve(here, "../.env"), path.resolve(here, "../.env.local")]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}
const arg = (name, fallback = null) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const upper = (v) => clean(v).toUpperCase();
const norm = (v) => clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const read = (p, label) => {
  if (!p || !fs.existsSync(p)) throw Object.assign(new Error(`${label} is missing: ${p}`), { code: "CATALOG_REMAP_FILE_MISSING" });
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
};
const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
const pack = (r) => ({ sellUnit: clean(r?.sellUnit), packageQuantity: positive(r?.packageQuantity), packageUnit: clean(r?.packageUnit), netQuantity: positive(r?.netQuantity), netUnit: clean(r?.netUnit) });
const currentPack = (r) => r?.packagingSellUnit ? ({ sellUnit: clean(r.packagingSellUnit), packageQuantity: positive(r.packagingPackageQuantity), packageUnit: clean(r.packagingPackageUnit), netQuantity: positive(r.packagingNetQuantity), netUnit: clean(r.packagingNetUnit) }) : null;
const samePack = (a, b) => Boolean(a && b) && norm(a.sellUnit) === norm(b.sellUnit) && Number(a.packageQuantity) === Number(b.packageQuantity) && norm(a.packageUnit) === norm(b.packageUnit) && Number(a.netQuantity) === Number(b.netQuantity) && norm(a.netUnit) === norm(b.netUnit);
const options = (old, r) => ({ ...(old && typeof old === "object" && !Array.isArray(old) ? old : {}), type: r.type, size: `${r.netQuantity}${r.netUnit}`, package: `${r.packageUnit} ${r.packageQuantity} ${r.sellUnit}`, sell_unit: r.sellUnit });
const csv = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
const countMap = (rows) => new Map(rows.map((r) => [String(r.variantId), Number(r.count) || 0]));

const manifestPath = path.resolve(arg("manifest", path.join(repoRoot, "data/catalog-remap/tea-batch-02.json")));
const commercialArg = arg("commercial-file");
if (!commercialArg) throw Object.assign(new Error("--commercial-file is required."), { code: "CATALOG_REMAP_COMMERCIAL_FILE_REQUIRED" });
const commercialPath = path.resolve(commercialArg);
const auditPath = path.resolve(arg("audit-verification", path.join(repoRoot, "data/catalog-remap/tea-batch-02-audit-verification.json")));
const outJson = path.resolve(arg("output-json", path.join(repoRoot, "artifacts/catalog-remap/tea-batch-02-dry-run.json")));
const outCsv = path.resolve(arg("output-csv", path.join(repoRoot, "artifacts/catalog-remap/tea-batch-02-dry-run.csv")));
const manifest = read(manifestPath, "Batch manifest");
const commercial = read(commercialPath, "Commercial payload");
const audit = read(auditPath, "Audit verification");
if (manifest.schemaVersion !== 2 || manifest.reviewApproval?.status !== "APPROVED") throw Object.assign(new Error("Batch manifest is not approved schema 2."), { code: "CATALOG_REMAP_BATCH_MANIFEST_INVALID" });
if (audit.taskId !== manifest.taskId || audit.status !== "BATCH_AUDIT_PASS" || audit.productionModified !== false || Number(audit.blockedCount) !== 0 || Number(audit.rowCount) !== manifest.rows.length) throw Object.assign(new Error("Batch audit verification is not valid."), { code: "CATALOG_REMAP_BATCH_AUDIT_INVALID" });
if (commercial.taskId !== manifest.taskId || !Array.isArray(commercial.rows) || commercial.rows.length !== manifest.rows.length) throw Object.assign(new Error("Commercial payload does not match manifest."), { code: "CATALOG_REMAP_BATCH_COMMERCIAL_INVALID" });

const remap = manifest.rows.filter((r) => r.action === "REMAP");
const createNew = manifest.rows.filter((r) => r.action === "CREATE_NEW");
const canonical = manifest.rows.map((r) => upper(r.canonicalSku));
const legacy = remap.map((r) => upper(r.legacySku));
if (new Set(canonical).size !== canonical.length || new Set(legacy).size !== legacy.length) throw Object.assign(new Error("Duplicate SKU in manifest."), { code: "CATALOG_REMAP_BATCH_DUPLICATE_SKU" });
for (const r of createNew) if (clean(r.legacySku)) throw Object.assign(new Error(`CREATE_NEW ${r.canonicalSku} must not have legacySku.`), { code: "CATALOG_REMAP_BATCH_CREATE_NEW_HAS_LEGACY" });
const commercialBySku = new Map(commercial.rows.map((r) => [upper(r.canonicalSku), r]));
const parentEntries = Object.entries(manifest.targetParents || {}).map(([detailGroup, p]) => ({ ...p, detailGroup }));
const parentByKey = new Map(parentEntries.map((p) => [p.productKey, p]));
const manifestHash = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) throw Object.assign(new Error("DATABASE_URL or BEPSI_DATABASE_URL is not configured."), { code: "CATALOG_REMAP_DATABASE_URL_REQUIRED" });
const targetUrl = new URL(connectionString);
const pool = new Pool({ connectionString, ssl: ["localhost", "127.0.0.1", "::1"].includes(targetUrl.hostname) ? false : { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");
  const survivors = parentEntries.map((p) => upper(p.survivorLegacySku)).filter(Boolean);
  const lookup = [...new Set([...legacy, ...canonical, ...survivors])];
  const variants = await client.query(`SELECT p.id::text "productId",p.product_key "productKey",p.name "productName",p.brand,p.industry_key "industryKey",p.catalog_group_key "catalogGroupKey",p.subcategory,p.status "productStatus",p.cover_image_object_key "coverImageObjectKey",v.id::text "variantId",v.variant_key "variantKey",v.sku,v.name "variantName",v.options,v.shop_price::float8 "shopPrice",v.is_active "isActive",v.is_public "isPublic",v.is_orderable "isOrderable",v.image_object_key "imageObjectKey",s.sell_unit "packagingSellUnit",s.package_quantity::float8 "packagingPackageQuantity",s.package_unit "packagingPackageUnit",s.net_quantity::float8 "packagingNetQuantity",s.net_unit "packagingNetUnit" FROM catalog_variants v JOIN catalog_products p ON p.id=v.product_id LEFT JOIN catalog_variant_packaging_specs s ON s.variant_id=v.id WHERE UPPER(v.sku)=ANY($1::text[]) ORDER BY UPPER(v.sku),v.id`, [lookup]);
  const bySku = new Map();
  for (const r of variants.rows) { const k = upper(r.sku); bySku.set(k, [...(bySku.get(k) || []), r]); }
  const products = await client.query(`SELECT id::text "productId",product_key "productKey",name "productName",brand,industry_key "industryKey",catalog_group_key "catalogGroupKey",subcategory,status FROM catalog_products WHERE product_key=ANY($1::text[])`, [parentEntries.map((p) => p.productKey)]);
  const productByKey = new Map(products.rows.map((r) => [r.productKey, r]));
  const schema = (await client.query(`SELECT to_regclass('public.catalog_variant_sku_aliases')::text "aliasTable",to_regclass('public.catalog_group_remap_batches')::text "batchTable"`)).rows[0] || {};
  const migrationRequired = !schema.aliasTable || !schema.batchTable;
  let aliasBySku = new Map();
  if (schema.aliasTable && legacy.length) {
    const rows = (await client.query(`SELECT alias_sku "aliasSku",variant_id::text "variantId" FROM catalog_variant_sku_aliases WHERE UPPER(alias_sku)=ANY($1::text[])`, [legacy])).rows;
    aliasBySku = new Map(rows.map((r) => [upper(r.aliasSku), r]));
  }

  const parents = [];
  const planByKey = new Map();
  for (const p of parentEntries) {
    const sm = bySku.get(upper(p.survivorLegacySku)) || [];
    const survivor = sm.length === 1 ? sm[0] : null;
    const existing = productByKey.get(p.productKey) || null;
    const blockers = [];
    if (p.strategy === "merge_keep_first_product" && sm.length !== 1) blockers.push(`survivor_sku_match_count=${sm.length}`);
    if (p.strategy === "merge_keep_first_product" && existing && survivor && existing.productId !== survivor.productId) blockers.push("target_parent_key_collision");
    const target = existing || survivor;
    const createProduct = !target && p.strategy === "attach_to_existing_or_create_parent";
    if (!target && !createProduct) blockers.push("target_parent_unresolved");
    const updateMetadata = Boolean(target) && (target.productKey !== p.productKey || norm(target.productName) !== norm(p.name) || norm(target.brand) !== norm(p.brand) || target.industryKey !== manifest.industryKey || target.catalogGroupKey !== manifest.catalogGroupKey || norm(target.subcategory) !== norm(p.detailGroup));
    const plan = { detailGroup: p.detailGroup, productKey: p.productKey, name: p.name, brand: p.brand, strategy: p.strategy, survivorLegacySku: p.survivorLegacySku, survivorVariantId: survivor?.variantId || null, survivorProductId: survivor?.productId || null, targetProductId: target?.productId || null, createProduct, updateMetadata, blockers, pass: blockers.length === 0 };
    parents.push(plan); planByKey.set(p.productKey, plan);
  }

  const remapIds = remap.flatMap((r) => { const m = bySku.get(upper(r.legacySku)) || []; return m.length === 1 ? [m[0].variantId] : []; });
  const refs = remapIds.length ? await Promise.all([
    client.query(`SELECT variant_id::text "variantId",COUNT(*)::int count FROM cart_items WHERE variant_id=ANY($1::uuid[]) GROUP BY variant_id`, [remapIds]),
    client.query(`SELECT variant_id::text "variantId",COUNT(*)::int count FROM order_items WHERE variant_id=ANY($1::uuid[]) GROUP BY variant_id`, [remapIds]),
    client.query(`SELECT id::text "ingredientId",catalog_variant_id::text "variantId",catalog_product_id::text "productId",catalog_snapshot snapshot FROM recipe_ingredients WHERE catalog_variant_id=ANY($1::uuid[])`, [remapIds]),
    client.query(`SELECT variant_id::text "variantId",COUNT(*)::int count FROM catalog_variant_prices WHERE variant_id=ANY($1::uuid[]) GROUP BY variant_id`, [remapIds]),
    client.query(`SELECT variant_id::text "variantId",COUNT(*)::int count FROM catalog_variant_packaging_specs WHERE variant_id=ANY($1::uuid[]) GROUP BY variant_id`, [remapIds]),
  ]) : [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }];
  const cart = countMap(refs[0].rows), orders = countMap(refs[1].rows), prices = countMap(refs[3].rows), packaging = countMap(refs[4].rows);
  const recipes = new Map();
  for (const r of refs[2].rows) recipes.set(r.variantId, [...(recipes.get(r.variantId) || []), r]);

  const rows = [];
  for (const expected of manifest.rows) {
    const source = commercialBySku.get(upper(expected.canonicalSku));
    const parent = planByKey.get(expected.targetParentKey);
    const canonicalMatches = bySku.get(upper(expected.canonicalSku)) || [];
    const blockers = [];
    if (!source) blockers.push("commercial_row_missing");
    if (source) {
      if (source.action !== expected.action) blockers.push("commercial_action_mismatch");
      if (upper(source.legacySku) !== upper(expected.legacySku)) blockers.push("commercial_legacy_sku_mismatch");
      if (norm(source.name) !== norm(expected.name)) blockers.push("commercial_name_mismatch");
      if (norm(source.group) !== norm(manifest.catalogGroupName) || norm(source.detailGroup) !== norm(expected.detailGroup)) blockers.push("commercial_group_mismatch");
      if (!samePack(pack(source), pack(expected))) blockers.push("commercial_packaging_mismatch");
      if (source.status !== "ready" || !positive(source.unitPrice)) blockers.push("commercial_row_not_ready");
    }
    if (!parent?.pass) blockers.push("target_parent_blocked");
    if (canonicalMatches.length) blockers.push(`canonical_sku_match_count=${canonicalMatches.length}`);
    if (expected.action === "CREATE_NEW") {
      rows.push({ rowNo: expected.rowNo, action: expected.action, pass: blockers.length === 0, blockers, legacySku: null, canonicalSku: expected.canonicalSku, variantId: null, sourceProductId: null, targetProductId: parent?.targetProductId || null, createTargetProduct: parent?.createProduct || false, generatedVariantKey: `${expected.targetParentKey}-${expected.canonicalSku.toLowerCase()}`, preserveVariantId: false, preserveImageObject: false, imageStatus: expected.imageMigration?.status || "WAITING_MANUAL_IMAGE", imageObjectKey: null, before: null, after: { productKey: expected.targetParentKey, sku: expected.canonicalSku, variantName: expected.name, options: options({}, expected), price: source ? Number(source.unitPrice) : null, packaging: pack(expected), legacyAlias: null, imageObjectKey: null }, changes: { createProduct: parent?.createProduct || false, createVariant: true, insertLegacyAlias: false, upsertPackaging: true, insertPrice: true }, references: { cartItemsPreserved: 0, orderItemsPreserved: 0, priceRowsPreserved: 0, packagingRowsExisting: 0, recipeIngredients: 0, recipeProductIdUpdates: 0, recipeSnapshotUpdates: 0 } });
      continue;
    }
    const lm = bySku.get(upper(expected.legacySku)) || [];
    const current = lm.length === 1 ? lm[0] : null;
    if (lm.length !== 1) blockers.push(`legacy_sku_match_count=${lm.length}`);
    if (current && (!current.isActive || !current.isPublic || !current.isOrderable)) blockers.push("legacy_variant_unavailable");
    const imageObjectKey = current?.imageObjectKey || current?.coverImageObjectKey || null;
    const missingAllowed = manifest.imageMigrationPolicy?.allowMissingImageDuringSkuRemap === true && ["MISSING_IMAGE_USER_CONFIRMED", "WAITING_MANUAL_IMAGE"].includes(expected.imageMigration?.status);
    if (current && !imageObjectKey && !missingAllowed) blockers.push("image_object_key_missing");
    const alias = aliasBySku.get(upper(expected.legacySku));
    if (alias && current && alias.variantId !== current.variantId) blockers.push("legacy_alias_collision");
    const targetProductId = parent?.targetProductId || null;
    const recipeRows = current ? recipes.get(current.variantId) || [] : [];
    const recipeProductIdUpdates = recipeRows.filter((r) => targetProductId && r.productId !== targetProductId).length;
    const recipeSnapshotUpdates = recipeRows.filter((r) => { const s = r.snapshot && typeof r.snapshot === "object" ? r.snapshot : {}; return targetProductId && (s.productId !== targetProductId || s.variantId !== current.variantId || upper(s.sku) !== upper(expected.canonicalSku) || norm(s.variantName) !== norm(expected.name)); }).length;
    const oldPack = currentPack(current), newPack = pack(expected), newOptions = options(current?.options, expected);
    rows.push({ rowNo: expected.rowNo, action: expected.action, pass: blockers.length === 0, blockers, legacySku: expected.legacySku, canonicalSku: expected.canonicalSku, variantId: current?.variantId || null, sourceProductId: current?.productId || null, targetProductId, createTargetProduct: parent?.createProduct || false, generatedVariantKey: current?.variantKey || null, preserveVariantId: true, preserveImageObject: true, imageStatus: expected.imageMigration?.status || null, imageObjectKey, before: current ? { productKey: current.productKey, sku: current.sku, variantName: current.variantName, options: current.options || {}, price: current.shopPrice == null ? null : Number(current.shopPrice), packaging: oldPack, imageObjectKey } : null, after: { productKey: expected.targetParentKey, sku: expected.canonicalSku, variantName: expected.name, options: newOptions, price: source ? Number(source.unitPrice) : null, packaging: newPack, legacyAlias: expected.legacySku, imageObjectKey }, changes: current ? { reparentProduct: Boolean(targetProductId && current.productId !== targetProductId), sku: upper(current.sku) !== upper(expected.canonicalSku), variantName: norm(current.variantName) !== norm(expected.name), price: source ? Number(current.shopPrice) !== Number(source.unitPrice) : false, packaging: !samePack(oldPack, newPack), insertLegacyAlias: !alias, preserveImageObjectKey: true } : null, references: { cartItemsPreserved: current ? cart.get(current.variantId) || 0 : 0, orderItemsPreserved: current ? orders.get(current.variantId) || 0 : 0, priceRowsPreserved: current ? prices.get(current.variantId) || 0 : 0, packagingRowsExisting: current ? packaging.get(current.variantId) || 0 : 0, recipeIngredients: recipeRows.length, recipeProductIdUpdates, recipeSnapshotUpdates } });
  }

  const globalBlockers = [];
  if (new Set(remapIds).size !== remap.length) globalBlockers.push("remap_variants_not_unique");
  for (const p of parents) for (const b of p.blockers) globalBlockers.push(`${p.productKey}:${b}`);
  const blocked = rows.filter((r) => !r.pass).length;
  const pass = !globalBlockers.length && !blocked;
  const sum = (key) => rows.reduce((n, r) => n + Number(r.references[key] || 0), 0);
  const summary = { rowCount: rows.length, remapCount: remap.length, createNewCount: createNew.length, rowPassCount: rows.length - blocked, rowBlockedCount: blocked, uniqueRemapVariantIds: new Set(remapIds).size, parentCount: parents.length, parentsCreated: parents.filter((p) => p.createProduct).length, parentsMetadataUpdated: parents.filter((p) => p.updateMetadata).length, variantsReparented: rows.filter((r) => r.changes?.reparentProduct).length, variantsCreated: createNew.length, aliasesInserted: rows.filter((r) => r.changes?.insertLegacyAlias).length, cartItemsPreserved: sum("cartItemsPreserved"), orderItemsPreserved: sum("orderItemsPreserved"), recipeProductIdUpdates: sum("recipeProductIdUpdates"), recipeSnapshotUpdates: sum("recipeSnapshotUpdates"), missingImagesAccepted: rows.filter((r) => ["MISSING_IMAGE_USER_CONFIRMED", "WAITING_MANUAL_IMAGE"].includes(r.imageStatus)).length, imageObjectsPreserved: rows.filter((r) => r.preserveImageObject && r.imageObjectKey).length, migrationRequired, globalBlockers };
  const report = { status: pass ? "BATCH_DRY_RUN_PASS" : "BATCH_DRY_RUN_BLOCKED", applied: false, canApplyNow: pass && !migrationRequired, canApplyAfterMigration: pass, target: { host: targetUrl.hostname, database: targetUrl.pathname.replace(/^\//, "") }, manifest: { path: manifestPath, taskId: manifest.taskId, groupKey: manifest.groupKey, hash: manifestHash, reviewApproval: manifest.reviewApproval }, auditVerification: { path: auditPath, status: audit.status, rowCount: audit.rowCount, blockedCount: audit.blockedCount, productionModified: audit.productionModified }, commercial: { path: commercialPath, payloadHash: commercial.payloadHash || null }, schema: { aliasTable: schema.aliasTable || null, batchTable: schema.batchTable || null, requiredMigration: migrationRequired ? "db/migrations/031_catalog_group_remap.sql" : null }, operations: { updateParentProducts: parents.filter((p) => p.updateMetadata && !p.createProduct).length, createParentProducts: parents.filter((p) => p.createProduct).length, remapVariants: remap.length, createVariants: createNew.length, insertLegacyAliases: remap.length, upsertPackagingSpecs: rows.length, updatePrices: rows.length, updateRecipeLinksAndSnapshots: summary.recipeProductIdUpdates + summary.recipeSnapshotUpdates, preserveCartAndOrderVariantReferences: true, preserveOrderItemSnapshots: true, preserveExistingImageObjectKeys: true, generateImages: false, r2Writes: 0 }, summary, parents, rows, note: "Read-only batch dry-run. No migration, SKU, product, variant, alias, image, price, packaging, cart, order, recipe, service, or R2 row/object was modified." };
  fs.mkdirSync(path.dirname(outJson), { recursive: true }); fs.mkdirSync(path.dirname(outCsv), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const headers = ["pass","rowNo","action","legacySku","canonicalSku","variantId","sourceProductId","targetProductId","createTargetProduct","reparentProduct","createVariant","skuChange","priceChange","packagingChange","insertLegacyAlias","cartItemsPreserved","orderItemsPreserved","recipeProductIdUpdates","recipeSnapshotUpdates","imageStatus","imageObjectKey","blockers"];
  const flat = rows.map((r) => ({ pass:r.pass,rowNo:r.rowNo,action:r.action,legacySku:r.legacySku,canonicalSku:r.canonicalSku,variantId:r.variantId,sourceProductId:r.sourceProductId,targetProductId:r.targetProductId,createTargetProduct:r.createTargetProduct,reparentProduct:r.changes?.reparentProduct||false,createVariant:r.changes?.createVariant||false,skuChange:r.changes?.sku||false,priceChange:r.changes?.price||false,packagingChange:r.changes?.packaging??r.changes?.upsertPackaging??false,insertLegacyAlias:r.changes?.insertLegacyAlias||false,cartItemsPreserved:r.references.cartItemsPreserved,orderItemsPreserved:r.references.orderItemsPreserved,recipeProductIdUpdates:r.references.recipeProductIdUpdates,recipeSnapshotUpdates:r.references.recipeSnapshotUpdates,imageStatus:r.imageStatus,imageObjectKey:r.imageObjectKey,blockers:r.blockers.join(" | ") }));
  fs.writeFileSync(outCsv, `${[headers.join(","), ...flat.map((r) => headers.map((h) => csv(r[h])).join(","))].join("\n")}\n`, "utf8");
  await client.query("ROLLBACK");
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exitCode = 2;
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({ status: "FAILED", code: error?.code || "CATALOG_REMAP_BATCH_DRY_RUN_FAILED", message: error instanceof Error ? error.message : String(error), details: error?.details }, null, 2));
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
