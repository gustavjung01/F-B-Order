import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import type { PoolClient } from "pg";
import { getDb } from "./db/pool";
import { requireAdmin } from "./modules/admin/admin-access";
import { createAdminCustomersRouter } from "./modules/admin/admin-customers.routes";
import { anonymousIdentity, resolveRequestIdentity, type RequestIdentity, type StaffIdentity } from "./modules/auth/auth.identity";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { createCatalogV2ChoiceCartRouter } from "./modules/catalog-v2/catalog-v2-choice-cart.routes";
import { catalogSelectionKey, normalizeChoiceKey } from "./modules/catalog-v2/catalog-v2-choices";
import { createCatalogV2DetailRouter } from "./modules/catalog-v2/catalog-v2-detail.routes";
import { createCatalogV2ListRouter } from "./modules/catalog-v2/catalog-v2-list.routes";
import { createCartRouter } from "./modules/catalog/cart.routes";
import { createCatalogRouter } from "./modules/catalog/catalog.routes";
import { createAdminOrdersRouter } from "./modules/orders/admin-orders.routes";
import { createCustomerOrdersRouter } from "./modules/orders/customer-orders.routes";
import { OrderEngineError, isOrderEngineError } from "./modules/orders/order-errors";
import { createOrderEntryRouter } from "./modules/orders/orders-entry.routes";
import { createRecipeReadRouter } from "./modules/recipes/recipe.routes";

export type AppConfig = {
  corsOrigin: string;
  serviceName: string;
  port: number;
  clerkSecretKey?: string;
  clerkPublishableKey?: string;
};

type Resolver = (req: Request) => Promise<RequestIdentity>;
type O = Record<string, unknown>;
type Unit = "g" | "kg" | "ml" | "l" | "piece" | "portion" | "pack";
type Status = "draft" | "in_review" | "published" | "archived";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNITS = new Set<Unit>(["g","kg","ml","l","piece","portion","pack"]);
const STATUSES = new Set<Status>(["draft","in_review","published","archived"]);

function bad(code: string, status: number, message: string, details?: unknown): never {
  throw new OrderEngineError(code, status, message, details);
}
function object(value: unknown, name = "body"): O {
  if (!value || typeof value !== "object" || Array.isArray(value)) bad("INVALID_RECIPE_INPUT",400,`${name} must be an object.`);
  return value as O;
}
function text(value: unknown, name: string, required = false, max = 10000) {
  const v = typeof value === "string" ? value.trim() : "";
  if (required && !v) bad("INVALID_RECIPE_INPUT",400,`${name} is required.`);
  if (v.length > max) bad("INVALID_RECIPE_INPUT",400,`${name} is too long.`);
  return v;
}
function id(value: unknown, name: string, nullable = false): string | null {
  if (nullable && (value == null || value === "")) return null;
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(v)) bad("INVALID_RECIPE_INPUT",400,`${name} must be a UUID.`);
  return v;
}
function numberValue(value: unknown, name: string, nullable = false, min = 0, max = 1000000): number | null {
  if (nullable && (value == null || value === "")) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) bad("INVALID_RECIPE_INPUT",400,`${name} is out of range.`);
  return Math.round(n * 10000) / 10000;
}
function integer(value: unknown, name: string, fallback: number, min: number, max: number) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) bad("INVALID_RECIPE_INPUT",400,`${name} is out of range.`);
  return n;
}
function list(value: unknown, name: string, max = 250): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) bad("INVALID_RECIPE_INPUT",400,`${name} is invalid.`);
  return value;
}
function stringList(value: unknown, name: string, max = 100) {
  return [...new Set(list(value,name,max).map((v,i)=>text(v,`${name}[${i}]`,true,500)))];
}
function recipeUnit(value: unknown, name: string, nullable = false): Unit | null {
  if (nullable && (value == null || value === "")) return null;
  if (typeof value !== "string" || !UNITS.has(value as Unit)) bad("INVALID_RECIPE_INPUT",400,`${name} is invalid.`);
  return value as Unit;
}
function catalogRef(value: unknown, name: string) {
  const v = object(value,name);
  const productId = id(v.productId,`${name}.productId`) as string;
  const variantId = id(v.variantId,`${name}.variantId`,true);
  const source = v.selections == null ? {} : object(v.selections,`${name}.selections`);
  const selections = Object.fromEntries(Object.entries(source).map(([k,x])=>[
    normalizeChoiceKey(k), text(x,`${name}.selections.${k}`,true,200)
  ]).filter(([k])=>Boolean(k)).sort(([a],[b])=>a.localeCompare(b))) as Record<string,string>;
  const selectionKey = catalogSelectionKey(selections);
  if (v.selectionKey != null && text(v.selectionKey,`${name}.selectionKey`,false,500) !== selectionKey) {
    bad("SELECTION_KEY_MISMATCH",400,"selectionKey does not match selections.");
  }
  return { productId, variantId, selections, selectionKey };
}
function normalize(value: unknown) {
  const v = object(value);
  const slug = text(v.slug,"slug",true,180).toLowerCase();
  if (!SLUG.test(slug)) bad("INVALID_RECIPE_SLUG",400,"Invalid slug.");
  const yieldQuantity = numberValue(v.yieldQuantity,"yieldQuantity",true,0.0001);
  const yieldUnit = recipeUnit(v.yieldUnit,"yieldUnit",true);
  if ((yieldQuantity === null) !== (yieldUnit === null)) bad("INVALID_RECIPE_YIELD",400,"Yield is incomplete.");
  const ingredients = list(v.ingredients,"ingredients").map((raw,i)=>{
    const x=object(raw,`ingredients[${i}]`);
    const sourceType=x.sourceType==="catalog"?"catalog":"external";
    const usageQuantity=numberValue(x.usageQuantity,"usageQuantity",true,0.0001);
    const usageUnit=recipeUnit(x.usageUnit,"usageUnit",true);
    const packageContentQuantity=numberValue(x.packageContentQuantity,"packageContentQuantity",true,0.0001);
    const packageContentUnit=recipeUnit(x.packageContentUnit,"packageContentUnit",true);
    if ((usageQuantity===null)!==(usageUnit===null) || (packageContentQuantity===null)!==(packageContentUnit===null)) {
      bad("INVALID_RECIPE_INGREDIENT",400,"Ingredient conversion is incomplete.");
    }
    const catalog=sourceType==="catalog"?catalogRef(x.catalog,`ingredients[${i}].catalog`):null;
    const isCartReady=x.isCartReady===true;
    if(isCartReady&&(!catalog?.variantId||usageQuantity===null||packageContentQuantity===null)){
      bad("RECIPE_INGREDIENT_NOT_CART_READY",400,"Ingredient is not cart ready.");
    }
    return {
      name:text(x.name,"ingredient.name",true,500),sourceType,usageQuantity,usageUnit,
      packageContentQuantity,packageContentUnit,
      wastePercent:numberValue(x.wastePercent??0,"wastePercent",false,0,100) as number,
      usableYieldPercent:numberValue(x.usableYieldPercent??100,"usableYieldPercent",false,0.01,100) as number,
      isOptional:x.isOptional===true,isCartReady,note:text(x.note,"note",false,4000)||null,catalog
    };
  });
  const steps=list(v.steps,"steps",100).map((raw)=>{
    const x=object(raw,"step");
    return {
      title:text(x.title,"step.title",false,500)||null,
      instruction:text(x.instruction,"step.instruction",true),
      durationSeconds:numberValue(x.durationSeconds,"durationSeconds",true,0,604800),
      temperatureCelsius:numberValue(x.temperatureCelsius,"temperatureCelsius",true,-50,500),
      successMarker:text(x.successMarker,"successMarker",false,4000)||null,
      warning:text(x.warning,"warning",false,4000)||null,
      mediaUrl:text(x.mediaUrl,"mediaUrl",false,2000)||null
    };
  });
  const mistakes=list(v.mistakes,"mistakes",100).map((raw)=>{
    const x=object(raw,"mistake");
    return {
      title:text(x.title,"mistake.title",true,500),symptom:text(x.symptom,"symptom",true,4000),
      likelyCauses:stringList(x.likelyCauses,"likelyCauses",30),
      immediateFix:text(x.immediateFix,"immediateFix",false,4000)||null,
      prevention:text(x.prevention,"prevention",true,4000),
      relatedStepOrder:x.relatedStepOrder==null?null:integer(x.relatedStepOrder,"relatedStepOrder",1,1,100),
      severity:x.severity==="low"||x.severity==="high"?x.severity:"medium"
    };
  });
  const businessTips=list(v.businessTips,"businessTips",100).map((raw)=>{
    const x=object(raw,"businessTip");
    return {
      title:text(x.title,"businessTip.title",true,500),recommendation:text(x.recommendation,"recommendation",true),
      targetCustomer:text(x.targetCustomer,"targetCustomer",false,2000)||null,
      sellingMoment:text(x.sellingMoment,"sellingMoment",false,2000)||null,
      comboSuggestion:text(x.comboSuggestion,"comboSuggestion",false,4000)||null,
      packagingSuggestion:text(x.packagingSuggestion,"packagingSuggestion",false,4000)||null,
      storageSuggestion:text(x.storageSuggestion,"storageSuggestion",false,4000)||null,
      batchPreparationSuggestion:text(x.batchPreparationSuggestion,"batchPreparationSuggestion",false,4000)||null
    };
  });
  const seasonalRules=list(v.seasonalRules,"seasonalRules",100).map((raw)=>{
    const x=object(raw,"seasonalRule");
    const type=x.type==="month_range"||x.type==="festival"||x.type==="weather"?x.type:"always";
    const startMonth=x.startMonth==null?null:integer(x.startMonth,"startMonth",1,1,12);
    const endMonth=x.endMonth==null?null:integer(x.endMonth,"endMonth",1,1,12);
    const festival=text(x.festival,"festival",false,500)||null;
    const weatherCondition=text(x.weatherCondition,"weatherCondition",false,1000)||null;
    if(type==="month_range"&&(startMonth===null||endMonth===null))bad("INVALID_SEASONAL_RULE",400,"Month range is required.");
    if(type==="festival"&&!festival)bad("INVALID_SEASONAL_RULE",400,"Festival is required.");
    if(type==="weather"&&!weatherCondition)bad("INVALID_SEASONAL_RULE",400,"Weather condition is required.");
    return {
      type,title:text(x.title,"seasonalRule.title",true,500),startMonth,endMonth,festival,weatherCondition,
      regions:stringList(x.regions,"regions"),suitabilityReason:text(x.suitabilityReason,"suitabilityReason",true,4000),
      marketingMessage:text(x.marketingMessage,"marketingMessage",false,4000)||null,
      priority:integer(x.priority,"priority",0,-100000,100000)
    };
  });
  const tagIds=stringList(v.tagIds,"tagIds").map((x,i)=>id(x,`tagIds[${i}]`) as string);
  const productLinks=list(v.productLinks,"productLinks",100).map((raw,i)=>{
    const x=object(raw,"productLink");
    return {catalog:catalogRef(x.catalog,`productLinks[${i}].catalog`),note:text(x.note,"note",false,4000)||null};
  });
  return {
    slug,title:text(v.title,"title",true,500),shortDescription:text(v.shortDescription,"shortDescription",false,4000),
    aliases:stringList(v.aliases,"aliases"),categoryId:id(v.categoryId,"categoryId",true),
    visibility:v.visibility==="public"?"public" as const:"internal" as const,
    difficulty:v.difficulty==="easy"||v.difficulty==="hard"?v.difficulty:"medium" as const,
    coverImageUrl:text(v.coverImageUrl,"coverImageUrl",false,2000)||null,
    prepMinutes:integer(v.prepMinutes,"prepMinutes",0,0,100000),
    cookMinutes:integer(v.cookMinutes,"cookMinutes",0,0,100000),
    yieldQuantity,yieldUnit,sortOrder:integer(v.sortOrder,"sortOrder",0,-100000,100000),
    ingredients,steps,mistakes,businessTips,seasonalRules,tagIds,productLinks
  };
}

async function storedAdmin(client: PoolClient, who: StaffIdentity) {
  const q=await client.query<{role:string;is_active:boolean}>(
    `SELECT role,is_active FROM staff_users WHERE id=$1::uuid FOR SHARE`,[who.staffId]
  );
  if(!q.rows[0]||q.rows[0].role!=="admin"||!q.rows[0].is_active)bad("ADMIN_ACCESS_REQUIRED",403,"Admin role is required.");
}
async function tx<T>(who: StaffIdentity, run:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await getDb().connect();
  try{
    await client.query("BEGIN");await storedAdmin(client,who);
    const result=await run(client);await client.query("COMMIT");return result;
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    const e=error as {code?:string;constraint?:string};
    if(e.code==="23505"&&e.constraint?.includes("slug"))bad("RECIPE_SLUG_CONFLICT",409,"Recipe slug already exists.");
    throw error;
  }finally{client.release();}
}
async function lock(client:PoolClient,recipeId:string){
  const q=await client.query<{status:Status}>(`SELECT status FROM recipes WHERE id=$1::uuid FOR UPDATE`,[recipeId]);
  if(!q.rows[0])bad("RECIPE_NOT_FOUND",404,"Recipe was not found.");
  return q.rows[0];
}
async function catalogSnapshot(client:PoolClient,ref:ReturnType<typeof catalogRef>){
  const q=await client.query<{product_name:string;variant_id:string|null;variant_name:string|null;sku:string|null;options:O|null}>(
    `SELECT p.name product_name,v.id::text variant_id,v.name variant_name,v.sku,v.options
     FROM catalog_products p LEFT JOIN catalog_variants v
       ON v.id=$2::uuid AND v.product_id=p.id AND v.catalog_version='hung-phat-v2'
     WHERE p.id=$1::uuid AND p.catalog_version='hung-phat-v2'`,[ref.productId,ref.variantId]
  );
  const r=q.rows[0];
  if(!r)bad("CATALOG_PRODUCT_NOT_FOUND",400,"Catalog product was not found.");
  if(ref.variantId&&r.variant_id!==ref.variantId)bad("CATALOG_VARIANT_PARENT_MISMATCH",400,"Variant does not belong to product.");
  const options=r.options||{};
  const specification=[
    typeof options.size==="string"?options.size:null,
    typeof options.package==="string"?options.package:null,
    typeof options.sell_unit==="string"?`ĐVT: ${options.sell_unit}`:null
  ].filter(Boolean).join(" · ")||null;
  return {...r,specification};
}
async function save(client:PoolClient,recipeId:string,doc:ReturnType<typeof normalize>){
  if(doc.categoryId){
    const q=await client.query(`SELECT 1 FROM recipe_categories WHERE id=$1::uuid`,[doc.categoryId]);
    if(!q.rowCount)bad("RECIPE_CATEGORY_NOT_FOUND",400,"Recipe category was not found.");
  }
  if(doc.tagIds.length){
    const q=await client.query<{count:number}>(`SELECT COUNT(*)::int count FROM recipe_tags WHERE id=ANY($1::uuid[])`,[doc.tagIds]);
    if(Number(q.rows[0]?.count)!==doc.tagIds.length)bad("RECIPE_TAG_NOT_FOUND",400,"Recipe tag was not found.");
  }
  await client.query(
    `UPDATE recipes SET slug=$2,title=$3,short_description=$4,recipe_category_id=$5::uuid,
     aliases=$6::jsonb,visibility=$7,difficulty=$8,cover_image_url=$9,prep_minutes=$10,
     cook_minutes=$11,yield_quantity=$12,yield_unit=$13,sort_order=$14,updated_at=now()
     WHERE id=$1::uuid`,
    [recipeId,doc.slug,doc.title,doc.shortDescription||null,doc.categoryId,JSON.stringify(doc.aliases),
     doc.visibility,doc.difficulty,doc.coverImageUrl,doc.prepMinutes,doc.cookMinutes,
     doc.yieldQuantity,doc.yieldUnit,doc.sortOrder]
  );
  await client.query(`DELETE FROM recipe_tag_links WHERE recipe_id=$1::uuid`,[recipeId]);
  await client.query(`DELETE FROM recipe_product_links WHERE recipe_id=$1::uuid`,[recipeId]);
  await client.query(`DELETE FROM recipe_seasonal_rules WHERE recipe_id=$1::uuid`,[recipeId]);
  await client.query(`DELETE FROM recipe_business_tips WHERE recipe_id=$1::uuid`,[recipeId]);
  await client.query(`DELETE FROM recipe_mistakes WHERE recipe_id=$1::uuid`,[recipeId]);
  await client.query(`DELETE FROM recipe_steps WHERE recipe_id=$1::uuid`,[recipeId]);
  await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id=$1::uuid`,[recipeId]);

  for(const [i,x] of doc.ingredients.entries()){
    const snap=x.catalog?await catalogSnapshot(client,x.catalog):null;
    await client.query(
      `INSERT INTO recipe_ingredients(
       recipe_id,product_name,quantity,unit,note,optional,sort_order,name,source_type,
       catalog_product_id,catalog_variant_id,default_selections,selection_key,usage_quantity,
       usage_unit,package_content_quantity,package_content_unit,waste_percent,usable_yield_percent,
       is_optional,is_cart_ready,catalog_product_name_snapshot,catalog_variant_name_snapshot,
       sku_snapshot,specification_snapshot,selection_key_snapshot,provenance_source)
       VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$2,$8,$9::uuid,$10::uuid,$11::jsonb,$12,$3,$4,
       $13,$14,$15,$16,$6,$17,$18,$19,$20,$21,$12,'human')`,
      [recipeId,x.name,x.usageQuantity,x.usageUnit,x.note,x.isOptional,i+1,x.sourceType,
       x.catalog?.productId||null,x.catalog?.variantId||null,JSON.stringify(x.catalog?.selections||{}),
       x.catalog?.selectionKey||"",x.packageContentQuantity,x.packageContentUnit,x.wastePercent,
       x.usableYieldPercent,x.isCartReady,snap?.product_name||null,snap?.variant_name||null,
       snap?.sku||null,snap?.specification||null]
    );
  }
  for(const [i,x] of doc.steps.entries())await client.query(
    `INSERT INTO recipe_steps(recipe_id,step_no,title,content,image_url,instruction,duration_seconds,
     temperature_celsius,success_marker,warning,media_url,sort_order,provenance_source)
     VALUES($1::uuid,$2,$3,$4,$5,$4,$6,$7,$8,$9,$5,$2,'human')`,
    [recipeId,i+1,x.title,x.instruction,x.mediaUrl,x.durationSeconds,x.temperatureCelsius,x.successMarker,x.warning]
  );
  for(const [i,x] of doc.mistakes.entries())await client.query(
    `INSERT INTO recipe_mistakes(recipe_id,title,symptom,likely_causes,immediate_fix,prevention,
     related_step_order,severity,sort_order,provenance_source)
     VALUES($1::uuid,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,'human')`,
    [recipeId,x.title,x.symptom,JSON.stringify(x.likelyCauses),x.immediateFix,x.prevention,x.relatedStepOrder,x.severity,i+1]
  );
  for(const [i,x] of doc.businessTips.entries())await client.query(
    `INSERT INTO recipe_business_tips(recipe_id,title,recommendation,target_customer,selling_moment,
     combo_suggestion,packaging_suggestion,storage_suggestion,batch_preparation_suggestion,sort_order,provenance_source)
     VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,'human')`,
    [recipeId,x.title,x.recommendation,x.targetCustomer,x.sellingMoment,x.comboSuggestion,
     x.packagingSuggestion,x.storageSuggestion,x.batchPreparationSuggestion,i+1]
  );
  for(const x of doc.seasonalRules)await client.query(
    `INSERT INTO recipe_seasonal_rules(recipe_id,rule_type,title,start_month,end_month,festival,
     weather_condition,regions,suitability_reason,marketing_message,priority,provenance_source)
     VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,'human')`,
    [recipeId,x.type,x.title,x.startMonth,x.endMonth,x.festival,x.weatherCondition,
     JSON.stringify(x.regions),x.suitabilityReason,x.marketingMessage,x.priority]
  );
  for(const tagId of doc.tagIds)await client.query(
    `INSERT INTO recipe_tag_links(recipe_id,tag_id)VALUES($1::uuid,$2::uuid)`,[recipeId,tagId]
  );
  for(const [i,x] of doc.productLinks.entries()){
    const snap=await catalogSnapshot(client,x.catalog);
    await client.query(
      `INSERT INTO recipe_product_links(recipe_id,catalog_product_id,catalog_variant_id,selections,
       selection_key,catalog_product_name_snapshot,catalog_variant_name_snapshot,sku_snapshot,
       specification_snapshot,note,sort_order)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
      [recipeId,x.catalog.productId,x.catalog.variantId,JSON.stringify(x.catalog.selections),
       x.catalog.selectionKey,snap.product_name,snap.variant_name,snap.sku,snap.specification,x.note,i+1]
    );
  }
}
async function load(recipeId:string,client:{query:PoolClient["query"]}=getDb()){
  const main=await client.query(
    `SELECT id::text,slug,title,COALESCE(short_description,'') "shortDescription",aliases,
     recipe_category_id::text "categoryId",visibility,difficulty,cover_image_url "coverImageUrl",
     prep_minutes "prepMinutes",cook_minutes "cookMinutes",yield_quantity::float8 "yieldQuantity",
     yield_unit "yieldUnit",sort_order "sortOrder",status,current_version "currentVersion",
     created_by_staff_id::text "createdByStaffId",approved_by_staff_id::text "approvedByStaffId",
     published_at "publishedAt",archived_at "archivedAt",created_at "createdAt",updated_at "updatedAt"
     FROM recipes WHERE id=$1::uuid`,[recipeId]
  );
  if(!main.rows[0])bad("RECIPE_NOT_FOUND",404,"Recipe was not found.");
  const [ingredients,steps,mistakes,businessTips,seasonalRules,tags,productLinks]=await Promise.all([
    client.query(`SELECT id::text,name,source_type "sourceType",usage_quantity::float8 "usageQuantity",
      usage_unit "usageUnit",package_content_quantity::float8 "packageContentQuantity",
      package_content_unit "packageContentUnit",waste_percent::float8 "wastePercent",
      usable_yield_percent::float8 "usableYieldPercent",is_optional "isOptional",
      is_cart_ready "isCartReady",note,
      CASE WHEN catalog_product_id IS NULL THEN NULL ELSE jsonb_build_object(
      'productId',catalog_product_id::text,'variantId',catalog_variant_id::text,
      'selections',default_selections,'selectionKey',selection_key) END catalog
      FROM recipe_ingredients WHERE recipe_id=$1::uuid ORDER BY sort_order,id`,[recipeId]),
    client.query(`SELECT id::text,title,instruction,duration_seconds "durationSeconds",
      temperature_celsius::float8 "temperatureCelsius",success_marker "successMarker",
      warning,media_url "mediaUrl" FROM recipe_steps WHERE recipe_id=$1::uuid ORDER BY sort_order,id`,[recipeId]),
    client.query(`SELECT id::text,title,symptom,likely_causes "likelyCauses",immediate_fix "immediateFix",
      prevention,related_step_order "relatedStepOrder",severity FROM recipe_mistakes
      WHERE recipe_id=$1::uuid ORDER BY sort_order,id`,[recipeId]),
    client.query(`SELECT id::text,title,recommendation,target_customer "targetCustomer",
      selling_moment "sellingMoment",combo_suggestion "comboSuggestion",
      packaging_suggestion "packagingSuggestion",storage_suggestion "storageSuggestion",
      batch_preparation_suggestion "batchPreparationSuggestion" FROM recipe_business_tips
      WHERE recipe_id=$1::uuid ORDER BY sort_order,id`,[recipeId]),
    client.query(`SELECT id::text,rule_type type,title,start_month "startMonth",end_month "endMonth",
      festival,weather_condition "weatherCondition",regions,suitability_reason "suitabilityReason",
      marketing_message "marketingMessage",priority FROM recipe_seasonal_rules
      WHERE recipe_id=$1::uuid ORDER BY priority DESC,created_at,id`,[recipeId]),
    client.query<{tag_id:string}>(`SELECT tag_id::text FROM recipe_tag_links WHERE recipe_id=$1::uuid ORDER BY tag_id`,[recipeId]),
    client.query(`SELECT id::text,jsonb_build_object('productId',catalog_product_id::text,
      'variantId',catalog_variant_id::text,'selections',selections,'selectionKey',selection_key) catalog,note
      FROM recipe_product_links WHERE recipe_id=$1::uuid ORDER BY sort_order,id`,[recipeId])
  ]);
  return {...main.rows[0],ingredients:ingredients.rows,steps:steps.rows,mistakes:mistakes.rows,
    businessTips:businessTips.rows,seasonalRules:seasonalRules.rows,
    tagIds:tags.rows.map(x=>x.tag_id),productLinks:productLinks.rows};
}
function editable(doc:O){
  const x={...doc};
  for(const k of ["id","status","currentVersion","createdByStaffId","approvedByStaffId","publishedAt","archivedAt","createdAt","updatedAt"])delete x[k];
  return x;
}
function merge(current:O,patch:unknown){
  const x=editable(current),p=object(patch);
  for(const k of ["slug","title","shortDescription","aliases","categoryId","visibility","difficulty",
    "coverImageUrl","prepMinutes","cookMinutes","yieldQuantity","yieldUnit","sortOrder","ingredients",
    "steps","mistakes","businessTips","seasonalRules","tagIds","productLinks"])if(k in p)x[k]=p[k];
  return x;
}
function review(doc:ReturnType<typeof normalize>){
  const errors:O[]=[],warnings:O[]=[];
  if(!doc.shortDescription)errors.push({code:"SHORT_DESCRIPTION_REQUIRED",section:"recipe"});
  if(doc.yieldQuantity===null)errors.push({code:"YIELD_REQUIRED",section:"recipe"});
  if(!doc.ingredients.length)errors.push({code:"INGREDIENTS_REQUIRED",section:"ingredients"});
  if(!doc.steps.length)errors.push({code:"STEPS_REQUIRED",section:"steps"});
  doc.ingredients.forEach((x,i)=>{
    if(x.usageQuantity===null)errors.push({code:"INGREDIENT_USAGE_REQUIRED",section:`ingredients[${i}]`});
    if(x.sourceType==="catalog"&&!x.isCartReady)warnings.push({code:"INGREDIENT_NOT_CART_READY",section:`ingredients[${i}]`});
    if(x.packageContentQuantity===null)warnings.push({code:"PACKAGE_CONVERSION_MISSING",section:`ingredients[${i}]`});
  });
  if(!doc.mistakes.length)warnings.push({code:"MISTAKE_GUIDE_MISSING",section:"mistakes"});
  if(!doc.businessTips.length)warnings.push({code:"BUSINESS_TIPS_MISSING",section:"businessTips"});
  return {errors,warnings};
}

export async function createAdminRecipe(who:StaffIdentity,body:unknown){
  requireAdmin(who);const doc=normalize(body);
  return tx(who,async client=>{
    const q=await client.query<{id:string}>(
      `INSERT INTO recipes(slug,title,short_description,status,visibility,difficulty,prep_minutes,
       cook_minutes,yield_quantity,yield_unit,sort_order,created_by_staff_id,provenance_source)
       VALUES($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11::uuid,'human') RETURNING id::text`,
      [doc.slug,doc.title,doc.shortDescription||null,doc.visibility,doc.difficulty,doc.prepMinutes,
       doc.cookMinutes,doc.yieldQuantity,doc.yieldUnit,doc.sortOrder,who.staffId]
    );
    await save(client,q.rows[0].id,doc);return {recipe:await load(q.rows[0].id,client)};
  });
}
export async function updateAdminRecipe(who:StaffIdentity,recipeId:string,patch:unknown){
  requireAdmin(who);const rid=id(recipeId,"recipeId") as string;
  return tx(who,async client=>{
    const state=await lock(client,rid);
    if(state.status==="published"||state.status==="archived")bad("RECIPE_NOT_EDITABLE",409,"Restore recipe before editing.");
    const doc=normalize(merge(await load(rid,client),patch));await save(client,rid,doc);
    await client.query(`UPDATE recipes SET status='draft',approved_by_staff_id=NULL WHERE id=$1::uuid`,[rid]);
    return {recipe:await load(rid,client)};
  });
}
export async function submitRecipeReview(who:StaffIdentity,recipeId:string){
  requireAdmin(who);const rid=id(recipeId,"recipeId") as string;
  return tx(who,async client=>{
    if((await lock(client,rid)).status!=="draft")bad("INVALID_RECIPE_TRANSITION",409,"Only draft can enter review.");
    const findings=review(normalize(editable(await load(rid,client))));
    if(findings.errors.length)bad("RECIPE_REVIEW_BLOCKED",422,"Recipe is not ready.",findings);
    await client.query(`UPDATE recipes SET status='in_review',updated_at=now() WHERE id=$1::uuid`,[rid]);
    return {recipe:await load(rid,client),findings};
  });
}
export async function publishAdminRecipe(who:StaffIdentity,recipeId:string,noteValue:unknown){
  requireAdmin(who);const rid=id(recipeId,"recipeId") as string;
  const note=text(noteValue,"changeNote",false,2000)||null;
  return tx(who,async client=>{
    if((await lock(client,rid)).status!=="in_review")bad("INVALID_RECIPE_TRANSITION",409,"Recipe must be in review.");
    const doc=normalize(editable(await load(rid,client))),findings=review(doc);
    if(findings.errors.length)bad("RECIPE_PUBLISH_BLOCKED",422,"Recipe cannot be published.",findings);
    for(const x of doc.ingredients)if(x.catalog)await catalogSnapshot(client,x.catalog);
    for(const x of doc.productLinks)await catalogSnapshot(client,x.catalog);
    const q=await client.query<{v:number}>(
      `SELECT COALESCE(MAX(version_number),0)::int+1 v FROM recipe_versions WHERE recipe_id=$1::uuid`,[rid]
    );
    const version=Number(q.rows[0]?.v||1),publishedAt=new Date().toISOString();
    await client.query(
      `INSERT INTO recipe_versions(recipe_id,version_number,snapshot,change_note,source,created_by_staff_id)
       VALUES($1::uuid,$2,$3::jsonb,$4,'human',$5::uuid)`,
      [rid,version,JSON.stringify({schemaVersion:1,document:{...doc,id:rid,status:"published",currentVersion:version,publishedAt}}),note,who.staffId]
    );
    await client.query(
      `UPDATE recipes SET status='published',current_version=$2,approved_by_staff_id=$3::uuid,
       published_at=$4::timestamptz,archived_at=NULL,updated_at=now() WHERE id=$1::uuid`,
      [rid,version,who.staffId,publishedAt]
    );
    return {recipe:await load(rid,client),versionNumber:version,findings};
  });
}
export async function archiveAdminRecipe(who:StaffIdentity,recipeId:string){
  requireAdmin(who);const rid=id(recipeId,"recipeId") as string;
  return tx(who,async client=>{
    if((await lock(client,rid)).status==="archived")bad("INVALID_RECIPE_TRANSITION",409,"Recipe is already archived.");
    await client.query(`UPDATE recipes SET status='archived',archived_at=now(),updated_at=now() WHERE id=$1::uuid`,[rid]);
    return {recipe:await load(rid,client)};
  });
}
export async function restoreAdminRecipeVersion(who:StaffIdentity,recipeId:string,versionValue:unknown){
  requireAdmin(who);const rid=id(recipeId,"recipeId") as string,version=integer(versionValue,"version",0,1,1000000);
  return tx(who,async client=>{
    await lock(client,rid);
    const q=await client.query<{snapshot:O}>(`SELECT snapshot FROM recipe_versions WHERE recipe_id=$1::uuid AND version_number=$2`,[rid,version]);
    if(!q.rows[0])bad("RECIPE_VERSION_NOT_FOUND",404,"Recipe version was not found.");
    const doc=normalize(object(q.rows[0].snapshot.document,"snapshot.document"));doc.visibility="internal";
    await save(client,rid,doc);
    await client.query(
      `UPDATE recipes SET status='draft',visibility='internal',approved_by_staff_id=NULL,
       published_at=NULL,archived_at=NULL,updated_at=now() WHERE id=$1::uuid`,[rid]
    );
    return {recipe:await load(rid,client),restoredFromVersion:version};
  });
}
function adminError(res:Response,error:unknown){
  if(isOrderEngineError(error)){res.status(error.status).json({error:error.code,message:error.message,details:error.details});return;}
  console.error("admin recipe request failed",error);res.status(500).json({error:"ADMIN_RECIPE_REQUEST_FAILED"});
}
export function createAdminRecipesRouter(resolve:Resolver){
  const router=express.Router(),who=async(req:Request)=>requireAdmin(await resolve(req));
  router.get("/",async(req,res)=>{
    try{
      await who(req);const values:unknown[]=[],where:string[]=[];
      if(req.query.status!=null&&req.query.status!==""){
        if(typeof req.query.status!=="string"||!STATUSES.has(req.query.status as Status))bad("INVALID_RECIPE_STATUS",400,"Invalid status.");
        values.push(req.query.status);where.push(`status=$${values.length}`);
      }
      const q=text(req.query.q,"q",false,120);
      if(q){values.push(`%${q}%`);where.push(`(title ILIKE $${values.length} OR slug ILIKE $${values.length})`);}
      const limit=integer(req.query.limit,"limit",50,1,100),offset=integer(req.query.offset,"offset",0,0,10000);
      values.push(limit,offset);
      const result=await getDb().query(
        `SELECT id::text,slug,title,status,visibility,difficulty,current_version "currentVersion",
         published_at "publishedAt",updated_at "updatedAt",COUNT(*) OVER()::int total
         FROM recipes ${where.length?`WHERE ${where.join(" AND ")}`:""}
         ORDER BY updated_at DESC,id DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values
      );
      const total=Number(result.rows[0]?.total||0);
      res.json({recipes:result.rows.map(({total:_t,...x})=>x),total,pagination:{limit,offset,hasMore:offset+result.rows.length<total}});
    }catch(e){adminError(res,e);}
  });
  router.post("/",async(req,res)=>{try{res.status(201).json(await createAdminRecipe(await who(req),req.body));}catch(e){adminError(res,e);}});
  router.get("/:recipeId/versions",async(req,res)=>{
    try{
      await who(req);const rid=id(req.params.recipeId,"recipeId") as string;await load(rid);
      const q=await getDb().query(
        `SELECT version_number "versionNumber",change_note "changeNote",source,
         created_by_staff_id::text "createdByStaffId",created_at "createdAt"
         FROM recipe_versions WHERE recipe_id=$1::uuid ORDER BY version_number DESC`,[rid]
      );res.json({versions:q.rows,total:q.rows.length});
    }catch(e){adminError(res,e);}
  });
  router.post("/:recipeId/restore/:version",async(req,res)=>{try{res.json(await restoreAdminRecipeVersion(await who(req),req.params.recipeId,req.params.version));}catch(e){adminError(res,e);}});
  router.post("/:recipeId/submit-review",async(req,res)=>{try{res.json(await submitRecipeReview(await who(req),req.params.recipeId));}catch(e){adminError(res,e);}});
  router.post("/:recipeId/publish",async(req,res)=>{try{res.json(await publishAdminRecipe(await who(req),req.params.recipeId,req.body?.changeNote));}catch(e){adminError(res,e);}});
  router.post("/:recipeId/archive",async(req,res)=>{try{res.json(await archiveAdminRecipe(await who(req),req.params.recipeId));}catch(e){adminError(res,e);}});
  router.get("/:recipeId",async(req,res)=>{try{await who(req);res.json({recipe:await load(id(req.params.recipeId,"recipeId") as string)});}catch(e){adminError(res,e);}});
  router.patch("/:recipeId",async(req,res)=>{try{res.json(await updateAdminRecipe(await who(req),req.params.recipeId,req.body));}catch(e){adminError(res,e);}});
  return router;
}

export function createApp(config: AppConfig) {
  const app = express();
  const clerkEnabled = Boolean(config.clerkSecretKey && config.clerkPublishableKey);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  const healthPayload = () => ({
    ok: true, service: config.serviceName, port: config.port, clerkEnabled,
    clerkMissing: { secretKey: !config.clerkSecretKey, publishableKey: !config.clerkPublishableKey },
    time: new Date().toISOString(),
  });
  app.get("/health", (_req, res) => res.json(healthPayload()));
  app.get("/api/health", (_req, res) => res.json(healthPayload()));
  app.get("/api/version", (_req, res) => res.json({ name: "Bếp Sỉ F&B API", service: config.serviceName, version: "catalog-v2-backend" }));
  if (clerkEnabled) app.use(clerkMiddleware({ secretKey: config.clerkSecretKey, publishableKey: config.clerkPublishableKey }));
  const identityResolver = clerkEnabled ? resolveRequestIdentity : async () => anonymousIdentity;
  app.use("/catalog", createCatalogV2ListRouter(identityResolver));
  app.use("/catalog", createCatalogV2DetailRouter(identityResolver));
  app.use("/api/catalog-v2", createCatalogV2ListRouter(identityResolver));
  app.use("/api/catalog-v2", createCatalogV2DetailRouter(identityResolver));
  app.use("/api/catalog", createCatalogRouter(identityResolver));
  app.use("/recipes", createRecipeReadRouter());
  app.use("/api/recipes", createRecipeReadRouter());
  if (clerkEnabled) {
    app.use("/catalog/cart", createCatalogV2ChoiceCartRouter(resolveRequestIdentity));
    app.use("/api/cart-v2", createCatalogV2ChoiceCartRouter(resolveRequestIdentity));
    app.use("/api/auth", createAuthRouter(resolveRequestIdentity));
    app.use("/api/cart", createCartRouter(resolveRequestIdentity));
    app.use("/api/orders", createOrderEntryRouter(resolveRequestIdentity));
    app.use("/api/customer/orders", createCustomerOrdersRouter(resolveRequestIdentity));
    app.use("/api/admin/customers", createAdminCustomersRouter(resolveRequestIdentity));
    app.use("/api/admin/orders", createAdminOrdersRouter(resolveRequestIdentity));
    app.use("/api/admin/recipes", createAdminRecipesRouter(resolveRequestIdentity));
  } else {
    const unavailable = (_req: Request, res: Response) => res.status(503).json({ error: "CLERK_NOT_CONFIGURED" });
    app.use("/catalog/cart", unavailable);
    app.use("/api/cart-v2", unavailable);
    app.use("/api/auth", unavailable);
    app.use("/api/cart", unavailable);
    app.use("/api/orders", unavailable);
    app.use("/api/customer/orders", unavailable);
    app.use("/api/admin/customers", unavailable);
    app.use("/api/admin/orders", unavailable);
    app.use("/api/admin/recipes", unavailable);
  }
  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  return app;
}
