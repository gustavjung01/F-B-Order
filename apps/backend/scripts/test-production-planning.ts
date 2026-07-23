import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool.js";
import type { StaffIdentity } from "../src/modules/auth/auth.identity.js";
import { saveKitchenCapacityProfile } from "../src/modules/kitchen/kitchen-capacity.service.js";
import { buildProductionPlan, enqueueProductionPlanAnalysis } from "../src/modules/production/production-planning.service.js";
import { createAdminRecipe } from "../src/modules/recipes/recipe-admin.service.js";

const db = getDb();

async function main(): Promise<void> {
  const suffix = randomUUID().replaceAll("-", "");
  let staffId: string | null = null;
  let productId: string | null = null;
  let variantId: string | null = null;
  let locationId: string | null = null;
  let supplierId: string | null = null;
  const recipeIds: string[] = [];
  const jobIds: string[] = [];

  try {
    const staff = await db.query<{ id: string }>(
      `INSERT INTO staff_users(clerk_user_id,email,name,role,is_active)
       VALUES($1,$2,$3,'admin',true)
       RETURNING id::text`,
      [`production-plan-${suffix}`, `production-plan-${suffix}@example.com`, "Production Plan Tester"],
    );
    staffId = staff.rows[0].id;
    const identity: StaffIdentity = {
      kind: "staff",
      clerkUserId: `production-plan-${suffix}`,
      staffId,
      role: "admin",
      isActive: true,
    };

    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products(
         catalog_version,product_key,name,brand,industry,industry_key,subcategory,
         source_group,option_groups,status,sort_order,catalog_group_key
       ) VALUES(
         'hung-phat-v2',$1,'Trà fixture Production Plan','Bếp Sỉ','Nguyên liệu trà sữa',
         'nguyen-lieu-tra-sua','Trà','production-plan-test','[]'::jsonb,
         'active',0,'tra'
       ) RETURNING id::text`,
      [`production-plan-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,catalog_version,variant_key,sku,name,options,price_mode,price_label,
         retail_price,shop_price,status,is_active,is_public,is_orderable,sort_order
       ) VALUES(
         $1,'hung-phat-v2',$2,$3,'Gói 1kg','{"size":"1kg"}'::jsonb,
         'fixed',NULL,100000,80000,'active',true,true,true,0
       ) RETURNING id::text`,
      [productId, `production-plan-variant-${suffix}`, `P7-${suffix.slice(0, 20)}`],
    );
    variantId = variant.rows[0].id;

    const location = await db.query<{ id: string }>(
      `INSERT INTO inventory_locations(location_key,name,status)
       VALUES($1,$2,'active') RETURNING id::text`,
      [`production-plan-${suffix}`, `Kho Production Plan ${suffix}`],
    );
    locationId = location.rows[0].id;
    await db.query(
      `INSERT INTO inventory_balances(
         location_id,catalog_variant_id,on_hand_quantity,reserved_quantity,reorder_point,safety_stock,unit
       ) VALUES($1,$2,0,0,0,0,'package')`,
      [locationId, variantId],
    );

    const supplier = await db.query<{ id: string }>(
      `INSERT INTO suppliers(supplier_code,name,status,default_lead_time_days,currency)
       VALUES($1,$2,'active',2,'VND') RETURNING id::text`,
      [`P7-${suffix.slice(0, 20)}`, `Nhà cung cấp P7 ${suffix}`],
    );
    supplierId = supplier.rows[0].id;
    await db.query(
      `INSERT INTO supplier_catalog_offers(
         supplier_id,catalog_variant_id,supplier_sku,purchase_price,currency,
         package_quantity,package_unit,minimum_order_quantity,lead_time_days,is_preferred,is_active
       ) VALUES($1,$2,$3,70000,'VND',1,'package',2,2,true,true)`,
      [supplierId, variantId, `SUP-P7-${suffix.slice(0, 16)}`],
    );

    async function createRecipe(label: string) {
      const created = await createAdminRecipe(identity, {
        slug: `production-plan-${label}-${suffix}`,
        title: `Recipe Production ${label}`,
        shortDescription: "Phase 7 integration fixture",
        description: "Dữ liệu tạm cho deterministic production planning.",
        relatedBrand: "Bếp Sỉ",
        yieldQuantity: 10,
        yieldUnit: "ly",
        sortOrder: 0,
        changeNote: "Production planning fixture",
        ingredients: [{ catalogVariantId: variantId, quantity: 100, unit: "g", optional: false }],
        steps: [{ title: "Pha chế", content: "Pha một batch.", imageUrl: null }],
      }, db);
      const recipeId = String(created.recipe.id);
      const versionId = String(created.recipe.currentVersionId);
      recipeIds.push(recipeId);
      await saveKitchenCapacityProfile(identity, recipeId, versionId, {
        batchOutputQuantity: 10,
        batchOutputUnit: "ly",
        setupMinutes: 0,
        steps: [{
          recipeStepNo: 1,
          stepName: "Pha chế",
          stationName: `Station P7 ${suffix}`,
          stationParallelSlots: 1,
          stationAvailableWorkers: 1,
          cycleMinutes: 20,
          laborMinutes: 10,
          outputPerRun: 10,
          workersRequired: 1,
          equipmentUnitsRequired: 0,
        }],
      }, db);
      return { recipeId, versionId };
    }

    const recipeA = await createRecipe("A");
    const recipeB = await createRecipe("B");
    const baseInput = {
      shiftMinutes: 60,
      lines: [
        { recipeId: recipeA.recipeId, versionId: recipeA.versionId, targetQuantity: 10 },
        { recipeId: recipeB.recipeId, versionId: recipeB.versionId, targetQuantity: 10 },
      ],
    };

    const needsPurchase = await buildProductionPlan(identity, baseInput, db);
    assert.equal(needsPurchase.status, "needs_purchase");
    assert.equal(needsPurchase.summary.recipeCount, 2);
    assert.equal(needsPurchase.summary.shortageSkuCount, 1);
    assert.equal(needsPurchase.summary.blockerCount, 0);
    assert.equal(needsPurchase.ingredients[0]?.requiredPackages, 1);
    assert.equal(needsPurchase.ingredients[0]?.availablePackages, 0);
    assert.equal(needsPurchase.ingredients[0]?.shortagePackages, 1);
    assert.equal(needsPurchase.ingredients[0]?.supplier?.recommendedOrderPackages, 2);
    assert.equal(needsPurchase.ingredients[0]?.supplier?.estimatedPurchaseCost, 140000);
    assert.equal(needsPurchase.stations[0]?.loadMinutes, 40);
    assert.equal(needsPurchase.stations[0]?.feasible, true);

    const analysis = await enqueueProductionPlanAnalysis(identity, {
      ...baseInput,
      prompt: "Giải thích kế hoạch và phần cần mua.",
    }, db);
    jobIds.push(analysis.jobId);
    const job = await db.query<{ jobType: string; kind: string; mayCreatePurchaseOrder: boolean }>(
      `SELECT
         job_type AS "jobType",
         context_data->>'kind' AS kind,
         (context_data->'policy'->>'mayCreatePurchaseOrder')::boolean AS "mayCreatePurchaseOrder"
       FROM ai_jobs WHERE id=$1`,
      [analysis.jobId],
    );
    assert.deepEqual(job.rows[0], {
      jobType: "read_only",
      kind: "production_plan_analysis",
      mayCreatePurchaseOrder: false,
    });

    await db.query(
      `UPDATE inventory_balances SET on_hand_quantity=2,updated_at=now()
       WHERE location_id=$1 AND catalog_variant_id=$2`,
      [locationId, variantId],
    );
    const ready = await buildProductionPlan(identity, baseInput, db);
    assert.equal(ready.status, "ready");
    assert.equal(ready.summary.shortageSkuCount, 0);
    assert.equal(ready.ingredients[0]?.status, "available");

    const blocked = await buildProductionPlan(identity, {
      shiftMinutes: 60,
      lines: [
        { recipeId: recipeA.recipeId, versionId: recipeA.versionId, targetQuantity: 30 },
        { recipeId: recipeB.recipeId, versionId: recipeB.versionId, targetQuantity: 30 },
      ],
    }, db);
    assert.equal(blocked.status, "blocked");
    assert.ok(blocked.warnings.some((warning) => warning.code === "SHARED_STATION_OVER_CAPACITY"));
    assert.equal(blocked.stations[0]?.loadMinutes, 120);
    assert.equal(blocked.stations[0]?.feasible, false);

    console.log("Production planning integration passed.");
  } finally {
    if (jobIds.length) await db.query("DELETE FROM ai_jobs WHERE id=ANY($1::uuid[])", [jobIds]).catch(() => undefined);
    for (const recipeId of recipeIds) await db.query("DELETE FROM recipes WHERE id=$1", [recipeId]).catch(() => undefined);
    if (locationId) await db.query("DELETE FROM inventory_locations WHERE id=$1", [locationId]).catch(() => undefined);
    if (supplierId) await db.query("DELETE FROM suppliers WHERE id=$1", [supplierId]).catch(() => undefined);
    if (variantId) await db.query("DELETE FROM catalog_variants WHERE id=$1", [variantId]).catch(() => undefined);
    if (productId) await db.query("DELETE FROM catalog_products WHERE id=$1", [productId]).catch(() => undefined);
    if (staffId) await db.query("DELETE FROM staff_users WHERE id=$1", [staffId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
