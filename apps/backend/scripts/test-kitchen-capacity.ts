import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool.js";
import type { StaffIdentity } from "../src/modules/auth/auth.identity.js";
import {
  enqueueKitchenCapacityAnalysis,
  getKitchenCapacityProfile,
  saveKitchenCapacityProfile,
  simulateKitchenCapacity,
} from "../src/modules/kitchen/kitchen-capacity.service.js";
import { createAdminRecipe } from "../src/modules/recipes/recipe-admin.service.js";

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  let staffId: string | null = null;
  let productId: string | null = null;
  let variantId: string | null = null;
  let recipeId: string | null = null;
  let jobId: string | null = null;
  const stationNames = [`Station brew ${suffix}`, `Station pack ${suffix}`];

  try {
    const staff = await db.query<{ id: string }>(
      `INSERT INTO staff_users(clerk_user_id,email,name,role,is_active)
       VALUES($1,$2,$3,'admin',true)
       RETURNING id::text`,
      [`kitchen-capacity-${suffix}`, `kitchen-capacity-${suffix}@example.com`, "Kitchen Capacity Test"],
    );
    staffId = staff.rows[0].id;
    const identity: StaffIdentity = {
      kind: "staff",
      clerkUserId: `kitchen-capacity-${suffix}`,
      staffId,
      role: "admin",
      isActive: true,
    };

    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products(
         catalog_version,product_key,name,brand,industry,industry_key,subcategory,
         source_group,option_groups,status,sort_order,catalog_group_key
       ) VALUES(
         'hung-phat-v2',$1,'Trà fixture năng lực bếp','Bếp Sỉ','Nguyên liệu trà sữa',
         'nguyen-lieu-tra-sua','Trà','kitchen-capacity-test','[]'::jsonb,
         'active',999996,'tra'
       ) RETURNING id::text`,
      [`kitchen-capacity-product-${suffix}`],
    );
    productId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants(
         product_id,catalog_version,variant_key,sku,name,options,price_mode,price_label,
         retail_price,shop_price,status,is_active,is_public,is_orderable,sort_order
       ) VALUES(
         $1,'hung-phat-v2',$2,$3,'Gói 1kg','{"size":"1kg"}'::jsonb,
         'fixed',NULL,NULL,100000,'active',true,true,true,999996
       ) RETURNING id::text`,
      [productId, `kitchen-capacity-variant-${suffix}`, `KCS-${suffix.slice(0, 20)}`],
    );
    variantId = variant.rows[0].id;

    const created = await createAdminRecipe(identity, {
      slug: `kitchen-capacity-${suffix}`,
      title: "Trà sữa kiểm thử năng lực bếp",
      shortDescription: "Fixture Phase 5",
      description: "Dữ liệu integration test phải được dọn sau khi chạy.",
      relatedBrand: "Bếp Sỉ",
      yieldQuantity: 10,
      yieldUnit: "ly",
      sortOrder: 999,
      changeNote: "Version dùng cho mô phỏng bếp",
      ingredients: [{ catalogVariantId: variantId, quantity: 100, unit: "g", optional: false }],
      steps: [
        { title: "Ủ trà", content: "Ủ trà theo batch.", imageUrl: null },
        { title: "Đóng gói", content: "Rót và đóng nắp.", imageUrl: null },
      ],
    }, db);
    recipeId = String(created.recipe.id);
    const versionId = String(created.recipe.currentVersionId);

    const emptyProfile = await getKitchenCapacityProfile(identity, recipeId, versionId, db);
    assert.equal(emptyProfile.readiness.status, "missing");
    assert.equal(emptyProfile.profile, null);

    const unavailable = await simulateKitchenCapacity(identity, {
      recipeId,
      versionId,
      targetQuantity: 100,
      shiftMinutes: 480,
    }, db);
    assert.ok("simulation" in unavailable);
    assert.equal(unavailable.simulation, null);

    const saved = await saveKitchenCapacityProfile(identity, recipeId, versionId, {
      batchOutputQuantity: 10,
      batchOutputUnit: "ly",
      setupMinutes: 0,
      notes: "Profile integration test",
      steps: [
        {
          recipeStepNo: 1,
          stepName: "Ủ trà",
          stationName: stationNames[0],
          stationParallelSlots: 2,
          stationAvailableWorkers: 2,
          equipmentName: `Brewer ${suffix}`,
          equipmentQuantity: 1,
          cycleMinutes: 10,
          laborMinutes: 5,
          outputPerRun: 10,
          workersRequired: 1,
          equipmentUnitsRequired: 1,
        },
        {
          recipeStepNo: 2,
          stepName: "Đóng gói",
          stationName: stationNames[1],
          stationParallelSlots: 3,
          stationAvailableWorkers: 1,
          cycleMinutes: 15,
          laborMinutes: 10,
          outputPerRun: 10,
          workersRequired: 1,
          equipmentUnitsRequired: 0,
        },
      ],
    }, db);
    assert.equal(saved.readiness.status, "ready");
    assert.equal(saved.profile?.steps.length, 2);

    const simulation = await simulateKitchenCapacity(identity, {
      recipeId,
      versionId,
      targetQuantity: 100,
      shiftMinutes: 480,
      extraWorkersPerStation: 2,
      extraEquipmentPerType: 1,
    }, db);
    assert.ok("baseline" in simulation);
    if (!("baseline" in simulation)) throw new Error("Expected ready simulation");
    assert.equal(simulation.baseline.bottleneck?.stepName, "Đóng gói");
    assert.equal(simulation.baseline.lineThroughputPerHour, 40);
    assert.equal(simulation.baseline.capacityPerShift, 320);
    assert.equal(simulation.baseline.estimatedCompletionMinutes, 160);
    assert.equal(simulation.baseline.feasible, true);
    assert.equal(simulation.scenario?.lineThroughputPerHour, 120);
    assert.equal(simulation.scenario?.capacityPerShift, 960);
    assert.equal(simulation.scenario?.estimatedCompletionMinutes, 70);
    assert.equal(simulation.improvement?.completionMinutesSaved, 90);
    assert.equal(simulation.improvement?.capacityGain, 640);

    const queued = await enqueueKitchenCapacityAnalysis(identity, {
      recipeId,
      versionId,
      targetQuantity: 100,
      shiftMinutes: 480,
      extraWorkersPerStation: 2,
      extraEquipmentPerType: 1,
      prompt: "Phân tích bottleneck và kịch bản tăng nguồn lực.",
    }, db);
    jobId = queued.jobId;
    assert.equal(queued.status, "pending");

    const job = await db.query<{
      job_type: string;
      context_scope: string[];
      context_data: { kind?: string; policy?: { readOnly?: boolean }; simulation?: { baseline?: { capacityPerShift?: number } } };
    }>(
      `SELECT job_type,context_scope,context_data FROM ai_jobs WHERE id=$1`,
      [jobId],
    );
    assert.equal(job.rows[0]?.job_type, "read_only");
    assert.ok(job.rows[0]?.context_scope.includes("kitchen_capacity"));
    assert.equal(job.rows[0]?.context_data.kind, "kitchen_capacity_simulation");
    assert.equal(job.rows[0]?.context_data.policy?.readOnly, true);
    assert.equal(job.rows[0]?.context_data.simulation?.baseline?.capacityPerShift, 320);

    console.log("Kitchen capacity integration passed.");
  } finally {
    if (jobId) await db.query("DELETE FROM ai_jobs WHERE id=$1", [jobId]).catch(() => undefined);
    if (recipeId) await db.query("DELETE FROM recipes WHERE id=$1", [recipeId]).catch(() => undefined);
    await db.query("DELETE FROM kitchen_stations WHERE name=ANY($1::text[])", [stationNames]).catch(() => undefined);
    if (staffId) await db.query("DELETE FROM staff_users WHERE id=$1", [staffId]).catch(() => undefined);
    if (variantId) await db.query("DELETE FROM catalog_variants WHERE id=$1", [variantId]).catch(() => undefined);
    if (productId) await db.query("DELETE FROM catalog_products WHERE id=$1", [productId]).catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
