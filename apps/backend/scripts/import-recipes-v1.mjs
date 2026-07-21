import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pgModule = require(process.env.PG_MODULE_PATH || "pg");
const pg = pgModule.default || pgModule;

const apply = process.argv.includes("--apply");
const root = path.resolve(import.meta.dirname, "../../..");
const dir = path.join(root, "data/recipes/bepsi-recipes-v1");
const recipesDoc = JSON.parse(await fs.readFile(path.join(dir,"recipes.standard.json"),"utf8"));
const imageDoc = JSON.parse(await fs.readFile(path.join(dir,"image-map.json"),"utf8"));
const catalogDoc = JSON.parse(await fs.readFile(path.join(dir,"catalog-map.json"),"utf8"));
const imageBySlug = new Map(imageDoc.entries.map(x=>[x.recipeSlug,x.publicUrl]));
const catalogByKey = new Map(Object.entries(catalogDoc.entries || {}));
const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL or BEPSI_DATABASE_URL is required");
const local = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const pool = new pg.Pool({connectionString,ssl:local?false:{rejectUnauthorized:process.env.DB_SSL_REJECT_UNAUTHORIZED!=="false"}});
const client = await pool.connect();
try {
  if (!apply) {
    const mappedEntries = Object.entries(catalogDoc.entries || {}).filter(([, entry]) => entry.catalogVariantId);
    const unmappedEntries = Object.entries(catalogDoc.entries || {}).filter(([, entry]) => !entry.catalogVariantId);
    const invalidVariants = [];
    for (const [key, entry] of mappedEntries) {
      const result = await client.query(
        `SELECT v.id::text AS variant_id, v.product_id::text AS product_id, v.sku, v.name AS variant_name, p.name AS product_name
         FROM catalog_variants v
         JOIN catalog_products p ON p.id = v.product_id
         WHERE v.id = $1`,
        [entry.catalogVariantId],
      );
      if (!result.rows[0]) invalidVariants.push({ key, catalogVariantId: entry.catalogVariantId });
    }
    const missingImages = imageDoc.entries.filter((entry) => entry.fileName && !entry.publicUrl).map((entry) => entry.recipeSlug);
    const summary = {
      ok: unmappedEntries.length === 0 && invalidVariants.length === 0 && missingImages.length === 0,
      recipes: recipesDoc.recipes.length,
      categories: recipesDoc.categories.length,
      mappedCatalogKeys: mappedEntries.length,
      unmappedCatalogKeys: unmappedEntries.map(([key]) => key),
      invalidVariants,
      uploadedImages: imageDoc.entries.filter((entry) => entry.publicUrl).length,
      missingImages,
      mode: "dry-run",
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) process.exitCode = 1;
  } else {
    await client.query("BEGIN");
  for (const c of recipesDoc.categories) {
    await client.query(`INSERT INTO recipe_categories(slug,name,sort_order,is_active) VALUES($1,$2,$3,true)
      ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,is_active=true,updated_at=now()`,[c.slug,c.name,c.sortOrder||0]);
  }
  const ids = new Map();
  for (const r of recipesDoc.recipes) {
    const cover=imageBySlug.get(r.slug)||null;
    const q=await client.query(`INSERT INTO recipes(slug,title,short_description,description,recipe_category_id,cover_image_url,status,sort_order,yield_quantity,yield_unit,recipe_kind,visibility,serving_size_ml,content_source_key,operational_notes)
      VALUES($1,$2,$3,$4,(SELECT id FROM recipe_categories WHERE slug=$5),$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
      ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,short_description=EXCLUDED.short_description,description=EXCLUDED.description,recipe_category_id=EXCLUDED.recipe_category_id,
      cover_image_url=COALESCE(EXCLUDED.cover_image_url,recipes.cover_image_url),sort_order=EXCLUDED.sort_order,yield_quantity=EXCLUDED.yield_quantity,yield_unit=EXCLUDED.yield_unit,
      recipe_kind=EXCLUDED.recipe_kind,visibility=EXCLUDED.visibility,serving_size_ml=EXCLUDED.serving_size_ml,content_source_key=EXCLUDED.content_source_key,operational_notes=EXCLUDED.operational_notes,updated_at=now()
      RETURNING id::text`,[r.slug,r.title,r.shortDescription,r.description,r.recipeCategory.slug,cover,r.sortOrder||0,r.yieldQuantity,r.yieldUnit,r.recipeKind,r.visibility,r.servingSizeMl,r.contentSourceKey,JSON.stringify(r.operationalNotes||[])]);
    ids.set(r.slug,q.rows[0].id);
  }
  for (const r of recipesDoc.recipes) {
    const recipeId=ids.get(r.slug);
    await client.query("DELETE FROM recipe_ingredients WHERE recipe_id=$1",[recipeId]);
    await client.query("DELETE FROM recipe_steps WHERE recipe_id=$1",[recipeId]);
    for (const i of r.ingredients) {
      const mapped=i.catalogKey?catalogByKey.get(i.catalogKey):null;
      const variantId=mapped?.catalogVariantId||null;
      let productId=null,snapshot=null;
      if (variantId) {
        const vr=await client.query(`SELECT v.id::text,v.product_id::text,v.sku,v.name AS variant_name,p.name AS product_name FROM catalog_variants v JOIN catalog_products p ON p.id=v.product_id WHERE v.id=$1`,[variantId]);
        if (!vr.rows[0]) throw new Error(`Catalog variant not found: ${variantId}`);
        const v=vr.rows[0]; productId=v.product_id; snapshot={variantId:v.id,productId:v.product_id,sku:v.sku,productName:v.product_name,variantName:v.variant_name};
      }
      const sourceRecipeId=i.sourceRecipeSlug?ids.get(i.sourceRecipeSlug):null;
      if (i.sourceType==="recipe"&&!sourceRecipeId) throw new Error(`Missing source recipe ${i.sourceRecipeSlug}`);
      await client.query(`INSERT INTO recipe_ingredients(recipe_id,product_name,quantity,unit,note,optional,sort_order,catalog_product_id,catalog_variant_id,catalog_snapshot,source_type,source_recipe_id,source_recipe_slug,catalog_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)`,[recipeId,i.productName,i.quantity,i.unit,i.note,i.optional||false,i.sortOrder||0,productId,variantId,snapshot?JSON.stringify(snapshot):null,i.sourceType||"manual",sourceRecipeId,i.sourceRecipeSlug||null,i.catalogKey||null]);
    }
    for (const s of r.steps) await client.query(`INSERT INTO recipe_steps(recipe_id,step_no,title,content) VALUES($1,$2,$3,$4)`,[recipeId,s.stepNo,s.title,s.content]);
  }
    await client.query("COMMIT");
    console.log(`Imported ${recipesDoc.recipes.length} recipes.`);
  }
} catch (e) { await client.query("ROLLBACK"); throw e; }
finally { client.release(); await pool.end(); }
