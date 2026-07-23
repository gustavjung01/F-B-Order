import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool.js";
import { requireAdmin } from "../admin/admin-access.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { OrderEngineError } from "../orders/order-errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SnapshotStep = { title?: unknown; content?: unknown };
type RecipeSnapshot = { yieldQuantity?: unknown; yieldUnit?: unknown; steps?: unknown };

type VersionRow = {
  recipeId: string;
  recipeTitle: string;
  versionId: string;
  versionNo: number;
  workflowStatus: string;
  snapshot: RecipeSnapshot;
};

type ProfileRow = {
  profileId: string;
  batchOutputQuantity: string;
  batchOutputUnit: string;
  setupMinutes: string;
  status: string;
  notes: string | null;
  updatedAt: string;
};

type OperationStepRow = {
  id: string;
  recipeStepNo: number;
  stepName: string;
  cycleMinutes: string;
  laborMinutes: string;
  outputPerRun: string;
  workersRequired: number;
  equipmentUnitsRequired: number;
  notes: string | null;
  sortOrder: number;
  stationId: string;
  stationKey: string;
  stationName: string;
  stationParallelSlots: number;
  stationAvailableWorkers: number;
  equipmentId: string | null;
  equipmentKey: string | null;
  equipmentName: string | null;
  equipmentQuantity: number | null;
};

export type KitchenCapacityStepInput = {
  recipeStepNo: number;
  stepName: string;
  stationName: string;
  stationParallelSlots: number;
  stationAvailableWorkers: number;
  equipmentName?: string | null;
  equipmentQuantity?: number | null;
  cycleMinutes: number;
  laborMinutes: number;
  outputPerRun: number;
  workersRequired: number;
  equipmentUnitsRequired?: number;
  notes?: string | null;
};

export type KitchenCapacityProfileInput = {
  batchOutputQuantity: number;
  batchOutputUnit: string;
  setupMinutes?: number;
  notes?: string | null;
  steps: KitchenCapacityStepInput[];
};

export type KitchenCapacitySimulationInput = {
  recipeId: string;
  versionId?: string;
  targetQuantity: number;
  shiftMinutes: number;
  extraWorkersPerStation?: number;
  extraEquipmentPerType?: number;
};

function normalizeUuid(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("INVALID_KITCHEN_CAPACITY_ID", 400, `${field} must be a UUID.`, { field });
  }
  return normalized;
}

function text(value: unknown, field: string, max = 240): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new OrderEngineError("KITCHEN_CAPACITY_FIELD_REQUIRED", 400, `${field} is required.`, { field });
  if (normalized.length > max) throw new OrderEngineError("KITCHEN_CAPACITY_FIELD_TOO_LONG", 400, `${field} is too long.`, { field, max });
  return normalized;
}

function optionalText(value: unknown, max = 2000): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  return normalized.slice(0, max);
}

function positive(value: unknown, field: string, max = 100000000): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new OrderEngineError("KITCHEN_CAPACITY_NUMBER_INVALID", 400, `${field} must be a positive number.`, { field });
  }
  return Math.round(parsed * 1000) / 1000;
}

function nonNegative(value: unknown, field: string, max = 100000000): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new OrderEngineError("KITCHEN_CAPACITY_NUMBER_INVALID", 400, `${field} must be zero or greater.`, { field });
  }
  return Math.round(parsed * 1000) / 1000;
}

function integer(value: unknown, field: string, min = 0, max = 1000): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new OrderEngineError("KITCHEN_CAPACITY_INTEGER_INVALID", 400, `${field} must be an integer between ${min} and ${max}.`, { field });
  }
  return parsed;
}

function resourceKey(value: string): string {
  const key = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!key) throw new OrderEngineError("KITCHEN_CAPACITY_RESOURCE_KEY_INVALID", 400, "Resource name cannot produce a valid key.");
  return key;
}

function snapshotSteps(snapshot: RecipeSnapshot): Array<{ recipeStepNo: number; stepName: string; content: string }> {
  if (!Array.isArray(snapshot.steps)) return [];
  return snapshot.steps.map((entry, index) => {
    const step = entry && typeof entry === "object" ? entry as SnapshotStep : {};
    const title = typeof step.title === "string" && step.title.trim() ? step.title.trim() : `Bước ${index + 1}`;
    const content = typeof step.content === "string" ? step.content.trim() : "";
    return { recipeStepNo: index + 1, stepName: title, content };
  });
}

async function loadVersion(
  db: Pick<Pool, "query"> | PoolClient,
  recipeIdValue: string,
  versionIdValue?: string,
): Promise<VersionRow> {
  const recipeId = normalizeUuid(recipeIdValue, "recipeId");
  const versionId = versionIdValue ? normalizeUuid(versionIdValue, "versionId") : null;
  const result = await db.query<VersionRow>(
    `SELECT
       recipe.id::text AS "recipeId",
       recipe.title AS "recipeTitle",
       version.id::text AS "versionId",
       version.version_no AS "versionNo",
       version.workflow_status AS "workflowStatus",
       version.snapshot
     FROM recipes recipe
     JOIN recipe_versions version
       ON version.recipe_id=recipe.id
      AND version.id=COALESCE($2::uuid,recipe.current_version_id)
     WHERE recipe.id=$1`,
    [recipeId, versionId],
  );
  const row = result.rows[0];
  if (!row) throw new OrderEngineError("RECIPE_VERSION_NOT_FOUND", 404, "Recipe Version was not found.");
  return row;
}

async function loadProfileRows(
  db: Pick<Pool, "query"> | PoolClient,
  versionId: string,
): Promise<{ profile: ProfileRow | null; steps: OperationStepRow[] }> {
  const profileResult = await db.query<ProfileRow>(
    `SELECT
       id::text AS "profileId",
       batch_output_quantity::text AS "batchOutputQuantity",
       batch_output_unit AS "batchOutputUnit",
       setup_minutes::text AS "setupMinutes",
       status,
       notes,
       updated_at::text AS "updatedAt"
     FROM recipe_version_operation_profiles
     WHERE recipe_version_id=$1`,
    [versionId],
  );
  const profile = profileResult.rows[0] ?? null;
  if (!profile) return { profile: null, steps: [] };

  const stepResult = await db.query<OperationStepRow>(
    `SELECT
       operation.id::text,
       operation.recipe_step_no AS "recipeStepNo",
       operation.step_name AS "stepName",
       operation.cycle_minutes::text AS "cycleMinutes",
       operation.labor_minutes::text AS "laborMinutes",
       operation.output_per_run::text AS "outputPerRun",
       operation.workers_required AS "workersRequired",
       operation.equipment_units_required AS "equipmentUnitsRequired",
       operation.notes,
       operation.sort_order AS "sortOrder",
       station.id::text AS "stationId",
       station.station_key AS "stationKey",
       station.name AS "stationName",
       station.parallel_slots AS "stationParallelSlots",
       station.available_workers AS "stationAvailableWorkers",
       equipment.id::text AS "equipmentId",
       equipment.equipment_key AS "equipmentKey",
       equipment.name AS "equipmentName",
       equipment.quantity AS "equipmentQuantity"
     FROM recipe_version_operation_steps operation
     JOIN kitchen_stations station ON station.id=operation.station_id
     LEFT JOIN kitchen_equipment equipment ON equipment.id=operation.equipment_id
     WHERE operation.profile_id=$1
     ORDER BY operation.sort_order,operation.recipe_step_no`,
    [profile.profileId],
  );
  return { profile, steps: stepResult.rows };
}

function numberValue(value: string): number {
  return Math.round(Number(value) * 1000) / 1000;
}

function serializeProfile(version: VersionRow, profile: ProfileRow | null, operations: OperationStepRow[]) {
  const recipeSteps = snapshotSteps(version.snapshot);
  const covered = new Set(operations.map((step) => step.recipeStepNo));
  const missingSteps = recipeSteps.filter((step) => !covered.has(step.recipeStepNo));
  const readiness = !profile
    ? { status: "missing" as const, missing: ["operation_profile"], message: "Recipe Version chưa có dữ liệu năng lực bếp." }
    : missingSteps.length || profile.status !== "ready"
      ? { status: "incomplete" as const, missing: missingSteps.map((step) => `step_${step.recipeStepNo}`), message: "Operational profile chưa bao phủ đầy đủ các bước Recipe." }
      : { status: "ready" as const, missing: [] as string[], message: "Đủ dữ liệu để mô phỏng deterministic." };

  return {
    schemaVersion: "kitchen-capacity-profile-v1",
    recipe: {
      id: version.recipeId,
      title: version.recipeTitle,
      versionId: version.versionId,
      versionNo: version.versionNo,
      workflowStatus: version.workflowStatus,
      snapshotYieldQuantity: version.snapshot.yieldQuantity ?? null,
      snapshotYieldUnit: version.snapshot.yieldUnit ?? null,
      steps: recipeSteps,
    },
    readiness,
    profile: profile ? {
      id: profile.profileId,
      batchOutputQuantity: numberValue(profile.batchOutputQuantity),
      batchOutputUnit: profile.batchOutputUnit,
      setupMinutes: numberValue(profile.setupMinutes),
      status: profile.status,
      notes: profile.notes,
      updatedAt: profile.updatedAt,
      steps: operations.map((step) => ({
        id: step.id,
        recipeStepNo: step.recipeStepNo,
        stepName: step.stepName,
        cycleMinutes: numberValue(step.cycleMinutes),
        laborMinutes: numberValue(step.laborMinutes),
        outputPerRun: numberValue(step.outputPerRun),
        workersRequired: step.workersRequired,
        equipmentUnitsRequired: step.equipmentUnitsRequired,
        notes: step.notes,
        station: {
          id: step.stationId,
          key: step.stationKey,
          name: step.stationName,
          parallelSlots: step.stationParallelSlots,
          availableWorkers: step.stationAvailableWorkers,
        },
        equipment: step.equipmentId ? {
          id: step.equipmentId,
          key: step.equipmentKey,
          name: step.equipmentName,
          quantity: step.equipmentQuantity,
        } : null,
      })),
    } : null,
  };
}

export async function getKitchenCapacityProfile(
  identity: StaffIdentity,
  recipeId: string,
  versionId?: string,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const version = await loadVersion(db, recipeId, versionId);
  const rows = await loadProfileRows(db, version.versionId);
  return serializeProfile(version, rows.profile, rows.steps);
}

function normalizeProfileInput(input: KitchenCapacityProfileInput, expectedSteps: Array<{ recipeStepNo: number }>) {
  const batchOutputQuantity = positive(input.batchOutputQuantity, "batchOutputQuantity");
  const batchOutputUnit = text(input.batchOutputUnit, "batchOutputUnit", 80);
  const setupMinutes = nonNegative(input.setupMinutes ?? 0, "setupMinutes", 100000);
  const notes = optionalText(input.notes);
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 100) {
    throw new OrderEngineError("KITCHEN_CAPACITY_STEPS_INVALID", 400, "steps must contain between 1 and 100 entries.");
  }

  const normalizedSteps = input.steps.map((step, index) => {
    const recipeStepNo = integer(step.recipeStepNo, `steps[${index}].recipeStepNo`, 1, 1000);
    const stationName = text(step.stationName, `steps[${index}].stationName`, 180);
    const equipmentName = optionalText(step.equipmentName, 180);
    const equipmentQuantity = equipmentName ? integer(step.equipmentQuantity, `steps[${index}].equipmentQuantity`, 1, 1000) : null;
    const equipmentUnitsRequired = equipmentName ? integer(step.equipmentUnitsRequired ?? 1, `steps[${index}].equipmentUnitsRequired`, 1, 1000) : 0;
    const cycleMinutes = positive(step.cycleMinutes, `steps[${index}].cycleMinutes`, 100000);
    const laborMinutes = nonNegative(step.laborMinutes, `steps[${index}].laborMinutes`, 100000);
    if (laborMinutes > cycleMinutes) {
      throw new OrderEngineError("KITCHEN_CAPACITY_LABOR_EXCEEDS_CYCLE", 400, "laborMinutes cannot exceed cycleMinutes.", { recipeStepNo });
    }
    return {
      recipeStepNo,
      stepName: text(step.stepName, `steps[${index}].stepName`, 240),
      stationName,
      stationKey: resourceKey(stationName),
      stationParallelSlots: integer(step.stationParallelSlots, `steps[${index}].stationParallelSlots`, 1, 1000),
      stationAvailableWorkers: integer(step.stationAvailableWorkers, `steps[${index}].stationAvailableWorkers`, 1, 1000),
      equipmentName,
      equipmentKey: equipmentName ? resourceKey(equipmentName) : null,
      equipmentQuantity,
      cycleMinutes,
      laborMinutes,
      outputPerRun: positive(step.outputPerRun, `steps[${index}].outputPerRun`),
      workersRequired: integer(step.workersRequired, `steps[${index}].workersRequired`, 1, 1000),
      equipmentUnitsRequired,
      notes: optionalText(step.notes),
    };
  });

  const expected = expectedSteps.map((step) => step.recipeStepNo).sort((a, b) => a - b);
  const received = normalizedSteps.map((step) => step.recipeStepNo).sort((a, b) => a - b);
  if (new Set(received).size !== received.length || JSON.stringify(expected) !== JSON.stringify(received)) {
    throw new OrderEngineError(
      "KITCHEN_CAPACITY_STEP_COVERAGE_INVALID",
      400,
      "Operational profile must contain exactly one entry for every Recipe step.",
      { expected, received },
    );
  }

  const stations = new Map<string, { parallelSlots: number; availableWorkers: number }>();
  const equipment = new Map<string, { stationKey: string; quantity: number }>();
  for (const step of normalizedSteps) {
    const stationConfig = stations.get(step.stationKey);
    if (stationConfig && (stationConfig.parallelSlots !== step.stationParallelSlots || stationConfig.availableWorkers !== step.stationAvailableWorkers)) {
      throw new OrderEngineError("KITCHEN_CAPACITY_STATION_CONFLICT", 400, `Station ${step.stationName} has conflicting capacity values.`);
    }
    stations.set(step.stationKey, { parallelSlots: step.stationParallelSlots, availableWorkers: step.stationAvailableWorkers });
    if (step.equipmentKey && step.equipmentQuantity) {
      const equipmentConfig = equipment.get(`${step.stationKey}:${step.equipmentKey}`);
      if (equipmentConfig && equipmentConfig.quantity !== step.equipmentQuantity) {
        throw new OrderEngineError("KITCHEN_CAPACITY_EQUIPMENT_CONFLICT", 400, `Equipment ${step.equipmentName} has conflicting quantity values.`);
      }
      equipment.set(`${step.stationKey}:${step.equipmentKey}`, { stationKey: step.stationKey, quantity: step.equipmentQuantity });
    }
  }

  return { batchOutputQuantity, batchOutputUnit, setupMinutes, notes, steps: normalizedSteps };
}

export async function saveKitchenCapacityProfile(
  identity: StaffIdentity,
  recipeId: string,
  versionId: string,
  input: KitchenCapacityProfileInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const version = await loadVersion(client, recipeId, versionId);
    const recipeSteps = snapshotSteps(version.snapshot);
    if (recipeSteps.length === 0) {
      throw new OrderEngineError("KITCHEN_CAPACITY_RECIPE_STEPS_MISSING", 409, "Recipe Version does not contain steps.");
    }
    const normalized = normalizeProfileInput(input, recipeSteps);

    const profileResult = await client.query<{ id: string }>(
      `INSERT INTO recipe_version_operation_profiles(
         recipe_version_id,batch_output_quantity,batch_output_unit,setup_minutes,status,notes,
         created_by_staff_id,updated_by_staff_id
       ) VALUES($1,$2,$3,$4,'ready',$5,$6,$6)
       ON CONFLICT(recipe_version_id) DO UPDATE SET
         batch_output_quantity=EXCLUDED.batch_output_quantity,
         batch_output_unit=EXCLUDED.batch_output_unit,
         setup_minutes=EXCLUDED.setup_minutes,
         status='ready',
         notes=EXCLUDED.notes,
         updated_by_staff_id=EXCLUDED.updated_by_staff_id,
         updated_at=now()
       RETURNING id::text`,
      [version.versionId, normalized.batchOutputQuantity, normalized.batchOutputUnit, normalized.setupMinutes, normalized.notes, identity.staffId],
    );
    const profileId = profileResult.rows[0].id;
    await client.query("DELETE FROM recipe_version_operation_steps WHERE profile_id=$1", [profileId]);

    const stationIds = new Map<string, string>();
    const equipmentIds = new Map<string, string>();
    for (const step of normalized.steps) {
      if (!stationIds.has(step.stationKey)) {
        const station = await client.query<{ id: string }>(
          `INSERT INTO kitchen_stations(station_key,name,parallel_slots,available_workers,status)
           VALUES($1,$2,$3,$4,'active')
           ON CONFLICT(station_key) DO UPDATE SET
             name=EXCLUDED.name,
             parallel_slots=EXCLUDED.parallel_slots,
             available_workers=EXCLUDED.available_workers,
             status='active',
             updated_at=now()
           RETURNING id::text`,
          [step.stationKey, step.stationName, step.stationParallelSlots, step.stationAvailableWorkers],
        );
        stationIds.set(step.stationKey, station.rows[0].id);
      }
      const stationId = stationIds.get(step.stationKey)!;
      let equipmentId: string | null = null;
      if (step.equipmentKey && step.equipmentName && step.equipmentQuantity) {
        const mapKey = `${step.stationKey}:${step.equipmentKey}`;
        if (!equipmentIds.has(mapKey)) {
          const equipment = await client.query<{ id: string }>(
            `INSERT INTO kitchen_equipment(station_id,equipment_key,name,quantity,status)
             VALUES($1,$2,$3,$4,'active')
             ON CONFLICT(station_id,equipment_key) DO UPDATE SET
               name=EXCLUDED.name,
               quantity=EXCLUDED.quantity,
               status='active',
               updated_at=now()
             RETURNING id::text`,
            [stationId, step.equipmentKey, step.equipmentName, step.equipmentQuantity],
          );
          equipmentIds.set(mapKey, equipment.rows[0].id);
        }
        equipmentId = equipmentIds.get(mapKey)!;
      }

      await client.query(
        `INSERT INTO recipe_version_operation_steps(
           profile_id,recipe_step_no,step_name,station_id,equipment_id,cycle_minutes,labor_minutes,
           output_per_run,workers_required,equipment_units_required,notes,sort_order
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          profileId,
          step.recipeStepNo,
          step.stepName,
          stationId,
          equipmentId,
          step.cycleMinutes,
          step.laborMinutes,
          step.outputPerRun,
          step.workersRequired,
          step.equipmentUnitsRequired,
          step.notes,
          step.recipeStepNo,
        ],
      );
    }

    await client.query("COMMIT");
    return getKitchenCapacityProfile(identity, version.recipeId, version.versionId, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function simulateScenario(
  profile: ProfileRow,
  steps: OperationStepRow[],
  targetQuantity: number,
  shiftMinutes: number,
  extraWorkersPerStation: number,
  extraEquipmentPerType: number,
) {
  const stepResults = steps.map((step) => {
    const cycleMinutes = numberValue(step.cycleMinutes);
    const laborMinutes = numberValue(step.laborMinutes);
    const outputPerRun = numberValue(step.outputPerRun);
    const effectiveWorkers = step.stationAvailableWorkers + extraWorkersPerStation;
    const effectiveEquipment = step.equipmentId ? (step.equipmentQuantity ?? 0) + extraEquipmentPerType : null;
    const stationParallel = step.stationParallelSlots;
    const workerParallel = Math.floor(effectiveWorkers / step.workersRequired);
    const equipmentParallel = step.equipmentId
      ? Math.floor((effectiveEquipment ?? 0) / step.equipmentUnitsRequired)
      : Number.POSITIVE_INFINITY;
    const parallelRuns = Math.max(0, Math.min(stationParallel, workerParallel, equipmentParallel));
    const requiredRuns = Math.ceil(targetQuantity / outputPerRun);
    const waves = parallelRuns > 0 ? Math.ceil(requiredRuns / parallelRuns) : null;
    const elapsedMinutes = waves === null ? null : Math.round(waves * cycleMinutes * 1000) / 1000;
    const throughputPerHour = parallelRuns > 0 ? Math.round(parallelRuns * outputPerRun * 60 / cycleMinutes * 1000) / 1000 : 0;
    const capacityPerShift = Math.floor(throughputPerHour * shiftMinutes / 60);
    const stationUtilization = requiredRuns * cycleMinutes / (stationParallel * shiftMinutes);
    const laborUtilization = requiredRuns * laborMinutes * step.workersRequired / (effectiveWorkers * shiftMinutes);
    const equipmentUtilization = step.equipmentId && effectiveEquipment
      ? requiredRuns * cycleMinutes * step.equipmentUnitsRequired / (effectiveEquipment * shiftMinutes)
      : 0;
    const utilization = Math.max(stationUtilization, laborUtilization, equipmentUtilization);
    return {
      recipeStepNo: step.recipeStepNo,
      stepName: step.stepName,
      station: {
        id: step.stationId,
        name: step.stationName,
        parallelSlots: stationParallel,
        availableWorkers: effectiveWorkers,
      },
      equipment: step.equipmentId ? {
        id: step.equipmentId,
        name: step.equipmentName,
        quantity: effectiveEquipment,
        unitsRequired: step.equipmentUnitsRequired,
      } : null,
      cycleMinutes,
      laborMinutes,
      outputPerRun,
      workersRequired: step.workersRequired,
      parallelRuns,
      requiredRuns,
      waves,
      elapsedMinutes,
      throughputPerHour,
      capacityPerShift,
      utilization: Math.round(utilization * 1000) / 1000,
      stationUtilization: Math.round(stationUtilization * 1000) / 1000,
      laborUtilization: Math.round(laborUtilization * 1000) / 1000,
      equipmentUtilization: Math.round(equipmentUtilization * 1000) / 1000,
      blockedReason: parallelRuns > 0 ? null : workerParallel < 1
        ? "Không đủ nhân sự đồng thời cho bước này."
        : "Không đủ thiết bị đồng thời cho bước này.",
    };
  });

  const availableSteps = stepResults.filter((step) => step.throughputPerHour > 0);
  const bottleneck = availableSteps.sort((a, b) => a.throughputPerHour - b.throughputPerHour)[0] ?? null;
  const lineThroughputPerHour = bottleneck?.throughputPerHour ?? 0;
  const setupMinutes = numberValue(profile.setupMinutes);
  const startupMinutes = setupMinutes + stepResults.reduce((sum, step) => sum + step.cycleMinutes, 0);
  const estimatedCompletionMinutes = bottleneck && lineThroughputPerHour > 0
    ? Math.round((startupMinutes + Math.max(0, targetQuantity - bottleneck.outputPerRun) / lineThroughputPerHour * 60) * 1000) / 1000
    : null;
  const capacityPerShift = Math.floor(lineThroughputPerHour * shiftMinutes / 60);
  const blocked = stepResults.some((step) => step.parallelRuns === 0);
  const feasible = !blocked && estimatedCompletionMinutes !== null && estimatedCompletionMinutes <= shiftMinutes;
  const maxUtilization = Math.max(0, ...stepResults.map((step) => step.utilization));
  const warnings: Array<{ code: string; severity: "info" | "warning" | "high"; message: string }> = [];
  if (blocked) warnings.push({ code: "RESOURCE_BLOCKED", severity: "high", message: "Ít nhất một công đoạn không có đủ nhân sự hoặc thiết bị để chạy." });
  if (!blocked && !feasible) warnings.push({ code: "SHIFT_CAPACITY_EXCEEDED", severity: "high", message: `Mục tiêu ${targetQuantity} vượt khả năng hoàn thành trong ca ${shiftMinutes} phút.` });
  if (maxUtilization > 1) warnings.push({ code: "RESOURCE_OVER_UTILIZED", severity: "warning", message: "Có tài nguyên cần sử dụng trên 100% thời lượng ca." });
  if (bottleneck) warnings.push({ code: "BOTTLENECK_IDENTIFIED", severity: "info", message: `Nút thắt là ${bottleneck.stepName} tại ${bottleneck.station.name}.` });

  return {
    extraWorkersPerStation,
    extraEquipmentPerType,
    targetQuantity,
    shiftMinutes,
    feasible,
    blocked,
    estimatedCompletionMinutes,
    lineThroughputPerHour,
    capacityPerShift,
    startupMinutes: Math.round(startupMinutes * 1000) / 1000,
    maxUtilization: Math.round(maxUtilization * 1000) / 1000,
    bottleneck: bottleneck ? {
      recipeStepNo: bottleneck.recipeStepNo,
      stepName: bottleneck.stepName,
      stationName: bottleneck.station.name,
      throughputPerHour: bottleneck.throughputPerHour,
    } : null,
    warnings,
    steps: stepResults,
  };
}

export async function simulateKitchenCapacity(
  identity: StaffIdentity,
  input: KitchenCapacitySimulationInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const targetQuantity = positive(input.targetQuantity, "targetQuantity");
  const shiftMinutes = positive(input.shiftMinutes, "shiftMinutes", 10080);
  const extraWorkers = integer(input.extraWorkersPerStation ?? 0, "extraWorkersPerStation", 0, 1000);
  const extraEquipment = integer(input.extraEquipmentPerType ?? 0, "extraEquipmentPerType", 0, 1000);
  const version = await loadVersion(db, input.recipeId, input.versionId);
  const rows = await loadProfileRows(db, version.versionId);
  const profileDocument = serializeProfile(version, rows.profile, rows.steps);
  if (!rows.profile || profileDocument.readiness.status !== "ready") {
    return {
      schemaVersion: "kitchen-capacity-simulation-v1",
      model: "deterministic_pipeline_v1",
      profile: profileDocument,
      simulation: null,
      message: "Chưa đủ dữ liệu vận hành để mô phỏng. Hệ thống không tự suy đoán thời gian, nhân lực hoặc thiết bị.",
    };
  }

  const baseline = simulateScenario(rows.profile, rows.steps, targetQuantity, shiftMinutes, 0, 0);
  const scenario = extraWorkers > 0 || extraEquipment > 0
    ? simulateScenario(rows.profile, rows.steps, targetQuantity, shiftMinutes, extraWorkers, extraEquipment)
    : null;
  const improvement = scenario ? {
    completionMinutesSaved: baseline.estimatedCompletionMinutes !== null && scenario.estimatedCompletionMinutes !== null
      ? Math.round((baseline.estimatedCompletionMinutes - scenario.estimatedCompletionMinutes) * 1000) / 1000
      : null,
    capacityGain: scenario.capacityPerShift - baseline.capacityPerShift,
    throughputGainPerHour: Math.round((scenario.lineThroughputPerHour - baseline.lineThroughputPerHour) * 1000) / 1000,
    feasibilityChanged: baseline.feasible !== scenario.feasible,
  } : null;

  return {
    schemaVersion: "kitchen-capacity-simulation-v1",
    model: "deterministic_pipeline_v1",
    generatedAt: new Date().toISOString(),
    assumptions: [
      "Mô hình pipeline dùng throughput thấp nhất làm công suất toàn tuyến.",
      "Giá trị thời gian, nhân sự và thiết bị lấy từ operational profile đã lưu.",
      "Kịch bản cộng cùng số nhân sự cho mỗi trạm và cùng số thiết bị cho mỗi loại được sử dụng.",
      "Kết quả không tự lập lịch ca hoặc tự phân công nhân sự.",
    ],
    recipe: profileDocument.recipe,
    profile: profileDocument.profile,
    baseline,
    scenario,
    improvement,
  };
}

export async function enqueueKitchenCapacityAnalysis(
  identity: StaffIdentity,
  input: KitchenCapacitySimulationInput & { prompt?: string },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const simulation = await simulateKitchenCapacity(identity, input, db);
  if (!simulation.simulation && !("baseline" in simulation)) {
    throw new OrderEngineError("KITCHEN_CAPACITY_PROFILE_INCOMPLETE", 409, "Operational profile is incomplete.", { profile: simulation.profile });
  }
  const prompt = optionalText(input.prompt, 4000) || "Phân tích năng lực bếp, nút thắt, khả năng hoàn thành trong ca và tác động của kịch bản bổ sung tài nguyên. Nêu dữ liệu và giả định trước khi kết luận.";
  const result = await db.query<{ id: string }>(
    `INSERT INTO ai_jobs(staff_user_id,job_type,prompt,context_scope,context_data)
     VALUES($1,'read_only',$2,$3,$4::jsonb)
     RETURNING id::text`,
    [
      identity.staffId,
      prompt,
      ["recipe_versions", "kitchen_capacity"],
      JSON.stringify({
        kind: "kitchen_capacity_simulation",
        instruction: "Use only the deterministic simulation supplied by the backend. Do not invent processing times, staffing, equipment, demand, or scheduling facts. Clearly separate baseline from scenario and never execute operational changes.",
        policy: { readOnly: true, mayAssignStaff: false, mayChangeRecipe: false, mayPurchaseEquipment: false },
        simulation,
      }),
    ],
  );
  return { jobId: result.rows[0].id, status: "pending", simulation };
}
