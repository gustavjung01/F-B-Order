import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool.js";
import { writeAdminAuditLog } from "../admin/admin-audit.js";
import { requireAdmin } from "../admin/admin-access.js";
import { buildRecipeCostPreview, type RecipeCostIngredientInput } from "../ai/recipe-cost.js";
import type { AiRequestMeta } from "../ai/ai-draft.service.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { OrderEngineError } from "../orders/order-errors.js";
import { readRecipeRdDraftContent, type RecipeRdConstraints } from "./recipe-rd-content.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INGREDIENT_GROUPS = [
  "tra", "siro", "sot", "sinh-to", "bot-sua-kem-beo", "milk-foam-kem-cheese",
  "tran-chau", "3q", "thach-rau-cau", "flan-pudding", "bot-tao-vi",
] as const;

export type CreateRecipeRdRequestInput = {
  recipeId: string;
  objective: string;
  constraints: RecipeRdConstraints;
  additionalNotes?: string | null;
};

export type RecipeRdTrialInput = {
  resultStatus: "planned" | "passed" | "needs_changes" | "failed";
  batchQuantity?: number | null;
  batchUnit?: string | null;
  sensoryScore?: number | null;
  operationalScore?: number | null;
  measurements?: Record<string, unknown>;
  note?: string | null;
};

type RecipeRow = {
  id: string;
  title: string;
  currentVersionId: string;
  currentVersionNo: number;
  workflowStatus: string;
  yieldQuantity: string | null;
  yieldUnit: string | null;
  snapshot: Record<string, unknown>;
};

type CatalogRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  options: unknown;
  status: string;
  priceMode: string;
  priceLabel: string | null;
  isOrderable: boolean;
  shopPrice: string | null;
  retailPrice: string | null;
  variantData: unknown;
  productData: unknown;
};

function normalizeUuid(value: string, field: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("RECIPE_RD_INVALID_ID", 400, `${field} must be a UUID.`);
  }
  return normalized;
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    if (required) throw new OrderEngineError("RECIPE_RD_FIELD_REQUIRED", 400, `${field} is required.`);
    return null;
  }
  if (normalized.length > max) throw new OrderEngineError("RECIPE_RD_FIELD_TOO_LONG", 400, `${field} is too long.`);
  return normalized;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function snapshotArray(snapshot: Record<string, unknown>, key: "ingredients" | "steps"): Record<string, unknown>[] {
  const value = snapshot[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

async function loadCurrentRecipe(db: Pool | PoolClient, recipeId: string): Promise<RecipeRow> {
  const result = await db.query<RecipeRow>(
    `SELECT
       recipe.id::text,
       recipe.title,
       recipe.current_version_id::text AS "currentVersionId",
       version.version_no AS "currentVersionNo",
       version.workflow_status AS "workflowStatus",
       recipe.yield_quantity::text AS "yieldQuantity",
       recipe.yield_unit AS "yieldUnit",
       version.snapshot
     FROM recipes recipe
     JOIN recipe_versions version ON version.id=recipe.current_version_id
     WHERE recipe.id=$1 AND recipe.status <> 'inactive'`,
    [recipeId],
  );
  const recipe = result.rows[0];
  if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe or current Recipe Version was not found.");
  if (!recipe.snapshot || typeof recipe.snapshot !== "object") {
    throw new OrderEngineError("RECIPE_VERSION_SNAPSHOT_MISSING", 409, "Current Recipe Version snapshot is missing.");
  }
  return recipe;
}

async function loadCatalog(db: Pool | PoolClient): Promise<CatalogRow[]> {
  const result = await db.query<CatalogRow>(
    `SELECT
       variant.id::text AS "variantId",
       product.id::text AS "productId",
       product.name AS "productName",
       variant.name AS "variantName",
       variant.sku,
       variant.options,
       variant.status,
       variant.price_mode AS "priceMode",
       variant.price_label AS "priceLabel",
       variant.is_orderable AS "isOrderable",
       variant.shop_price::text AS "shopPrice",
       variant.retail_price::text AS "retailPrice",
       to_jsonb(variant) AS "variantData",
       to_jsonb(product) AS "productData"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id=variant.product_id
     WHERE product.catalog_version='hung-phat-v2'
       AND variant.catalog_version='hung-phat-v2'
       AND product.status='active'
       AND product.catalog_group_key=ANY($1::text[])
       AND variant.is_active=true
       AND variant.is_public=true
       AND variant.status IN ('active','market_price')
     ORDER BY variant.is_orderable DESC,product.sort_order,variant.sort_order,variant.sku
     LIMIT 400`,
    [INGREDIENT_GROUPS],
  );
  return result.rows;
}

function buildBaseCost(recipe: RecipeRow, catalog: CatalogRow[]) {
  const byId = new Map(catalog.map((item) => [item.variantId, item]));
  const ingredients = snapshotArray(recipe.snapshot, "ingredients").map((item) => {
    const variantId = typeof item.catalogVariantId === "string" ? item.catalogVariantId : null;
    const catalogItem = variantId ? byId.get(variantId) : undefined;
    return {
      productName: typeof item.productName === "string" ? item.productName : "Nguyên liệu",
      quantity: typeof item.quantity === "number" || typeof item.quantity === "string" ? item.quantity : null,
      unit: typeof item.unit === "string" ? item.unit : null,
      optional: item.optional === true,
      catalogVariantId: variantId,
      sourceType: typeof item.sourceType === "string" ? item.sourceType : null,
      sourceRecipeSlug: typeof item.sourceRecipeSlug === "string" ? item.sourceRecipeSlug : null,
      sku: catalogItem?.sku ?? null,
      shopPrice: catalogItem?.shopPrice ?? null,
      retailPrice: catalogItem?.retailPrice ?? null,
      variantData: catalogItem?.variantData ?? null,
      productData: catalogItem?.productData ?? null,
    } satisfies RecipeCostIngredientInput;
  });
  return buildRecipeCostPreview(
    { id: recipe.id, title: recipe.title, yieldQuantity: recipe.yieldQuantity, yieldUnit: recipe.yieldUnit },
    ingredients,
  );
}

async function buildRequestContext(
  db: Pool | PoolClient,
  rdRequestId: string,
  recipe: RecipeRow,
  objective: string,
  constraints: RecipeRdConstraints,
) {
  const catalog = await loadCatalog(db);
  if (!catalog.length) throw new OrderEngineError("RECIPE_RD_CATALOG_EMPTY", 409, "No eligible catalog ingredients are available for R&D.");
  const variantIds = catalog.map((item) => item.variantId);
  const [inventory, suppliers, kitchen] = await Promise.all([
    db.query(
      `SELECT catalog_variant_id::text AS "variantId",COALESCE(sum(available_quantity),0)::text AS "availableQuantity"
       FROM inventory_balances
       WHERE catalog_variant_id=ANY($1::uuid[])
       GROUP BY catalog_variant_id`,
      [variantIds],
    ),
    db.query(
      `SELECT DISTINCT ON (offer.catalog_variant_id)
         offer.catalog_variant_id::text AS "variantId",supplier.name AS "supplierName",
         offer.purchase_price::text AS "purchasePrice",offer.package_quantity::text AS "packageQuantity",
         offer.package_unit AS "packageUnit",offer.minimum_order_quantity::text AS "minimumOrderQuantity",
         COALESCE(offer.lead_time_days,supplier.default_lead_time_days) AS "leadTimeDays"
       FROM supplier_catalog_offers offer
       JOIN suppliers supplier ON supplier.id=offer.supplier_id
       WHERE offer.catalog_variant_id=ANY($1::uuid[])
         AND offer.is_active=true AND supplier.status='active'
         AND (offer.valid_from IS NULL OR offer.valid_from<=CURRENT_DATE)
         AND (offer.valid_until IS NULL OR offer.valid_until>=CURRENT_DATE)
       ORDER BY offer.catalog_variant_id,offer.is_preferred DESC,offer.purchase_price ASC`,
      [variantIds],
    ),
    db.query<{ profileVersionId: string | null; stepCount: number }>(
      `SELECT profile.recipe_version_id::text AS "profileVersionId",COUNT(step.id)::int AS "stepCount"
       FROM recipe_version_operation_profiles profile
       LEFT JOIN recipe_version_operation_steps step ON step.profile_id=profile.id
       WHERE profile.recipe_version_id=$1 AND profile.status='ready'
       GROUP BY profile.recipe_version_id`,
      [recipe.currentVersionId],
    ),
  ]);

  const baseIngredients = snapshotArray(recipe.snapshot, "ingredients").map((item) => ({
    productName: typeof item.productName === "string" ? item.productName : "Nguyên liệu",
    quantity: typeof item.quantity === "string" || typeof item.quantity === "number" ? item.quantity : null,
    unit: typeof item.unit === "string" ? item.unit : null,
    optional: item.optional === true,
    catalogVariantId: typeof item.catalogVariantId === "string" ? item.catalogVariantId : null,
  }));
  const baseSteps = snapshotArray(recipe.snapshot, "steps").map((item) => ({
    title: typeof item.title === "string" ? item.title : null,
    content: typeof item.content === "string" ? item.content : "",
  }));
  const kitchenRow = kitchen.rows[0];

  return {
    kind: "recipe_rd_request" as const,
    rdRequestId,
    instruction: "Use only supplied Recipe, Catalog, cost, inventory, supplier, and kitchen data. Return the exact JSON contract requested. Use only catalogVariantId values present in catalog. Never invent SKU, price, stock, supplier terms, sensory certainty, processing time, or equipment facts.",
    objective,
    constraints,
    recipe: {
      id: recipe.id,
      title: recipe.title,
      currentVersionId: recipe.currentVersionId,
      currentVersionNo: recipe.currentVersionNo,
      yieldQuantity: recipe.yieldQuantity,
      yieldUnit: recipe.yieldUnit,
      ingredients: baseIngredients,
      steps: baseSteps,
      snapshot: recipe.snapshot,
    },
    catalog,
    inventory: inventory.rows,
    suppliers: suppliers.rows,
    baseCost: buildBaseCost(recipe, catalog),
    kitchen: {
      readiness: kitchenRow && kitchenRow.stepCount > 0 ? "ready" as const : "missing" as const,
      profileVersionId: kitchenRow?.profileVersionId ?? null,
    },
  };
}

function buildPrompt(recipe: RecipeRow, objective: string, constraints: RecipeRdConstraints, additionalNotes: string | null): string {
  return [
    "[RECIPE_TASK:RD]",
    `Tạo đúng một phương án R&D cho công thức ${recipe.title}.`,
    `Mục tiêu: ${objective}`,
    `Ràng buộc: ${JSON.stringify(constraints)}`,
    additionalNotes ? `Ghi chú thêm: ${additionalNotes}` : null,
    "Chỉ trả một JSON object hợp lệ theo cấu trúc sau, không markdown và không thêm chữ ngoài JSON:",
    '{"title":"Tên phương án","rationale":"Lý do","proposal":{"yieldQuantity":1,"yieldUnit":"ly","ingredients":[{"productName":"Tên","catalogVariantId":"UUID từ catalog","quantity":1,"unit":"g","optional":false,"note":null}],"steps":[{"title":"Bước","content":"Hướng dẫn"}]},"expectedEffects":["..."],"risks":["..."],"testPlan":[{"metric":"Chỉ số","target":"Mục tiêu đo","method":"Cách đo"}]}',
    "Mọi nguyên liệu phải dùng catalogVariantId có trong context catalog. Không tạo SKU mới. Không khẳng định cảm quan đạt trước khi test. Không thay đổi Recipe đang bán.",
  ].filter(Boolean).join("\n");
}

export async function createRecipeRdRequest(
  identity: StaffIdentity,
  input: CreateRecipeRdRequestInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const recipeId = normalizeUuid(input.recipeId, "recipeId");
  const objective = text(input.objective, "objective", 2000, true)!;
  const additionalNotes = text(input.additionalNotes, "additionalNotes", 2000);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const recipe = await loadCurrentRecipe(client, recipeId);
    const insertedRequest = await client.query<{ id: string }>(
      `INSERT INTO recipe_rd_requests(created_by_staff_id,recipe_id,base_recipe_version_id,objective,constraints)
       VALUES($1,$2,$3,$4,$5::jsonb)
       RETURNING id::text`,
      [identity.staffId, recipe.id, recipe.currentVersionId, objective, JSON.stringify(input.constraints)],
    );
    const requestId = insertedRequest.rows[0].id;
    const context = await buildRequestContext(client, requestId, recipe, objective, input.constraints);
    const job = await client.query<{ id: string }>(
      `INSERT INTO ai_jobs(
         staff_user_id,job_type,prompt,context_scope,context_data,draft_type,draft_title
       ) VALUES($1,'draft',$2,$3,$4::jsonb,'recipe',$5)
       RETURNING id::text`,
      [
        identity.staffId,
        buildPrompt(recipe, objective, input.constraints, additionalNotes),
        ["recipes", "catalog", "cost", "inventory", "suppliers", "kitchen_capacity", "recipe_rd"],
        JSON.stringify(context),
        `R&D nháp - ${recipe.title}`,
      ],
    );
    await client.query("UPDATE recipe_rd_requests SET ai_job_id=$2 WHERE id=$1", [requestId, job.rows[0].id]);
    await client.query("COMMIT");
    return { requestId, jobId: job.rows[0].id, status: "queued" as const };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listRecipeRdRequests(identity: StaffIdentity, db: Pool = getDb()) {
  requireAdmin(identity);
  const result = await db.query(
    `SELECT
       request.id::text,
       request.recipe_id::text AS "recipeId",
       recipe.title AS "recipeTitle",
       request.base_recipe_version_id::text AS "baseRecipeVersionId",
       base_version.version_no AS "baseRecipeVersionNo",
       request.objective,
       request.constraints,
       request.status,
       request.ai_job_id::text AS "aiJobId",
       job.status AS "aiJobStatus",
       job.error_code AS "aiJobErrorCode",
       job.error_message AS "aiJobErrorMessage",
       request.ai_draft_id::text AS "aiDraftId",
       draft.status AS "aiDraftStatus",
       request.applied_recipe_version_id::text AS "appliedRecipeVersionId",
       applied_version.version_no AS "appliedRecipeVersionNo",
       creator.name AS "createdByName",
       reviewer.name AS "reviewedByName",
       request.created_at AS "createdAt",
       request.updated_at AS "updatedAt",
       COALESCE(trial.count,0)::int AS "trialCount"
     FROM recipe_rd_requests request
     JOIN recipes recipe ON recipe.id=request.recipe_id
     JOIN recipe_versions base_version ON base_version.id=request.base_recipe_version_id
     LEFT JOIN ai_jobs job ON job.id=request.ai_job_id
     LEFT JOIN ai_drafts draft ON draft.id=request.ai_draft_id
     LEFT JOIN recipe_versions applied_version ON applied_version.id=request.applied_recipe_version_id
     LEFT JOIN staff_users creator ON creator.id=request.created_by_staff_id
     LEFT JOIN staff_users reviewer ON reviewer.id=request.reviewed_by_staff_id
     LEFT JOIN LATERAL (
       SELECT count(*) FROM recipe_rd_trial_results result WHERE result.rd_request_id=request.id
     ) trial ON true
     ORDER BY request.created_at DESC
     LIMIT 200`,
  );
  return { requests: result.rows };
}

export async function recordRecipeRdTrialResult(
  identity: StaffIdentity,
  requestIdValue: string,
  input: RecipeRdTrialInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const requestId = normalizeUuid(requestIdValue, "requestId");
  const request = await db.query<{ status: string }>("SELECT status FROM recipe_rd_requests WHERE id=$1", [requestId]);
  if (!request.rows[0]) throw new OrderEngineError("RECIPE_RD_REQUEST_NOT_FOUND", 404, "Recipe R&D request was not found.");
  if (!["generated", "approved", "applied"].includes(request.rows[0].status)) {
    throw new OrderEngineError("RECIPE_RD_TRIAL_NOT_ALLOWED", 409, "Trial results can only be recorded after a proposal is generated.");
  }
  const batchQuantity = input.batchQuantity ?? null;
  const batchUnit = text(input.batchUnit, "batchUnit", 80);
  if ((batchQuantity === null) !== (batchUnit === null)) {
    throw new OrderEngineError("RECIPE_RD_TRIAL_BATCH_INVALID", 400, "batchQuantity and batchUnit must be supplied together.");
  }
  const result = await db.query<{ id: string }>(
    `INSERT INTO recipe_rd_trial_results(
       rd_request_id,recorded_by_staff_id,result_status,batch_quantity,batch_unit,
       sensory_score,operational_score,measurements,note
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     RETURNING id::text`,
    [
      requestId,
      identity.staffId,
      input.resultStatus,
      batchQuantity,
      batchUnit,
      input.sensoryScore ?? null,
      input.operationalScore ?? null,
      JSON.stringify(input.measurements ?? {}),
      text(input.note, "note", 4000),
    ],
  );
  return { trialResultId: result.rows[0].id, status: input.resultStatus };
}

export async function applyApprovedRecipeRdDraft(
  identity: StaffIdentity,
  draftIdValue: string,
  meta: AiRequestMeta,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const draftId = normalizeUuid(draftIdValue, "draftId");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const draftResult = await client.query<{
      id: string;
      status: string;
      content: unknown;
      targetRecipeId: string | null;
      baseRecipeVersionId: string | null;
    }>(
      `SELECT id::text,status,content,target_recipe_id::text AS "targetRecipeId",
              base_recipe_version_id::text AS "baseRecipeVersionId"
       FROM ai_drafts WHERE id=$1 FOR UPDATE`,
      [draftId],
    );
    const draft = draftResult.rows[0];
    if (!draft) throw new OrderEngineError("AI_DRAFT_NOT_FOUND", 404, "AI draft was not found.");
    if (draft.status !== "approved") throw new OrderEngineError("AI_DRAFT_NOT_APPROVED", 409, "R&D draft must be approved before application.");
    const content = readRecipeRdDraftContent(draft.content);
    if (content.targetRecipeId !== draft.targetRecipeId || content.baseRecipeVersionId !== draft.baseRecipeVersionId) {
      throw new OrderEngineError("AI_DRAFT_TARGET_MISMATCH", 409, "Stored R&D draft target does not match workflow metadata.");
    }
    if (content.evaluation.constraints.some((constraint) => constraint.status === "failed")) {
      throw new OrderEngineError("RECIPE_RD_CONSTRAINT_FAILED", 409, "R&D proposal violates an explicit constraint and cannot be applied.", {
        constraints: content.evaluation.constraints,
      });
    }

    const recipeResult = await client.query<{
      id: string;
      status: string;
      currentVersionId: string | null;
      publishedVersionId: string | null;
    }>(
      `SELECT id::text,status,current_version_id::text AS "currentVersionId",
              published_version_id::text AS "publishedVersionId"
       FROM recipes WHERE id=$1 FOR UPDATE`,
      [content.targetRecipeId],
    );
    const recipe = recipeResult.rows[0];
    if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
    if (recipe.status === "inactive") throw new OrderEngineError("RECIPE_ARCHIVED", 409, "Archived recipes cannot receive R&D proposals.");
    if (recipe.currentVersionId !== content.baseRecipeVersionId) {
      throw new OrderEngineError("AI_DRAFT_STALE", 409, "Recipe changed after this R&D proposal was generated.", {
        baseRecipeVersionId: content.baseRecipeVersionId,
        currentRecipeVersionId: recipe.currentVersionId,
      });
    }

    const baseVersionResult = await client.query<{ snapshot: Record<string, unknown>; workflowStatus: string }>(
      `SELECT snapshot,workflow_status AS "workflowStatus"
       FROM recipe_versions WHERE id=$1 AND recipe_id=$2`,
      [content.baseRecipeVersionId, content.targetRecipeId],
    );
    const baseVersion = baseVersionResult.rows[0];
    if (!baseVersion?.snapshot) throw new OrderEngineError("RECIPE_VERSION_SNAPSHOT_MISSING", 409, "Base Recipe Version snapshot is missing.");
    if (["in_review", "approved"].includes(baseVersion.workflowStatus)) {
      throw new OrderEngineError("RECIPE_REVIEW_LOCKED", 409, "Recipe is in review or approved and cannot receive an R&D proposal.");
    }

    await client.query("DELETE FROM recipe_ingredients WHERE recipe_id=$1", [content.targetRecipeId]);
    await client.query("DELETE FROM recipe_steps WHERE recipe_id=$1", [content.targetRecipeId]);
    for (const [index, ingredient] of content.proposal.ingredients.entries()) {
      await client.query(
        `INSERT INTO recipe_ingredients(
           recipe_id,product_name,quantity,unit,note,optional,catalog_product_id,
           catalog_variant_id,catalog_snapshot,sort_order
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
        [
          content.targetRecipeId,
          ingredient.productName,
          ingredient.quantity,
          ingredient.unit,
          ingredient.note,
          ingredient.optional,
          ingredient.catalogProductId,
          ingredient.catalogVariantId,
          JSON.stringify(ingredient.catalogSnapshot),
          index,
        ],
      );
    }
    for (const [index, step] of content.proposal.steps.entries()) {
      await client.query(
        `INSERT INTO recipe_steps(recipe_id,step_no,title,content,image_url,media_id)
         VALUES($1,$2,$3,$4,NULL,NULL)`,
        [content.targetRecipeId, index + 1, step.title, step.content],
      );
    }

    const nextSnapshot = {
      ...baseVersion.snapshot,
      yieldQuantity: content.proposal.yieldQuantity,
      yieldUnit: content.proposal.yieldUnit,
      ingredients: content.proposal.ingredients.map((ingredient) => ({
        productName: ingredient.productName,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        note: ingredient.note,
        optional: ingredient.optional,
        catalogVariantId: ingredient.catalogVariantId,
        catalogProductId: ingredient.catalogProductId,
        catalogSnapshot: ingredient.catalogSnapshot,
      })),
      steps: content.proposal.steps,
    };
    const versionNoResult = await client.query<{ nextVersionNo: number }>(
      `SELECT COALESCE(MAX(version_no),0)::int+1 AS "nextVersionNo"
       FROM recipe_versions WHERE recipe_id=$1`,
      [content.targetRecipeId],
    );
    const nextVersionNo = versionNoResult.rows[0]?.nextVersionNo ?? 1;
    const insertedVersion = await client.query<{ id: string }>(
      `INSERT INTO recipe_versions(
         recipe_id,version_no,workflow_status,snapshot,change_note,created_by_staff_id
       ) VALUES($1,$2,'draft',$3::jsonb,$4,$5)
       RETURNING id::text`,
      [
        content.targetRecipeId,
        nextVersionNo,
        JSON.stringify(nextSnapshot),
        `R&D: ${content.objective}`.slice(0, 2000),
        identity.staffId,
      ],
    );
    const versionId = insertedVersion.rows[0].id;
    await client.query(
      `UPDATE recipes SET
         yield_quantity=$2,yield_unit=$3,current_version_id=$4,
         status=CASE WHEN published_version_id IS NULL THEN 'draft' ELSE 'active' END,
         updated_by_staff_id=$5,updated_at=now()
       WHERE id=$1`,
      [content.targetRecipeId, content.proposal.yieldQuantity, content.proposal.yieldUnit, versionId, identity.staffId],
    );
    await client.query(
      `INSERT INTO recipe_media_version_refs(version_id,media_id,usage,step_no)
       SELECT $2::uuid,recipe.cover_media_id,'cover',NULL
       FROM recipes recipe WHERE recipe.id=$1 AND recipe.cover_media_id IS NOT NULL`,
      [content.targetRecipeId, versionId],
    );

    const applicationData = {
      kind: "recipe_rd",
      rdRequestId: content.rdRequestId,
      baseRecipeVersionId: content.baseRecipeVersionId,
      appliedRecipeVersionId: versionId,
      appliedRecipeVersionNo: nextVersionNo,
      constraintResults: content.evaluation.constraints,
      cost: content.evaluation.cost,
    };
    await client.query(
      `UPDATE ai_drafts SET
         status='applied',applied_by_staff_id=$2,applied_at=now(),
         applied_recipe_version_id=$3,application_data=$4::jsonb,updated_at=now()
       WHERE id=$1`,
      [draftId, identity.staffId, versionId, JSON.stringify(applicationData)],
    );
    await client.query(
      `UPDATE recipe_rd_requests SET
         status='applied',applied_by_staff_id=$2,applied_at=now(),applied_recipe_version_id=$3
       WHERE id=$1`,
      [content.rdRequestId, identity.staffId, versionId],
    );
    await client.query(
      `INSERT INTO ai_draft_events(draft_id,event_type,actor_staff_id,note,metadata)
       VALUES($1,'applied',$2,$3,$4::jsonb)`,
      [draftId, identity.staffId, `Áp dụng R&D proposal thành Recipe Version ${nextVersionNo}`, JSON.stringify(applicationData)],
    );
    await writeAdminAuditLog({
      actorStaffId: identity.staffId,
      actionKey: "recipe.rd.apply",
      resourceType: "recipe",
      resourceId: content.targetRecipeId,
      outcome: "success",
      permissionKey: "recipe.rd.apply",
      reason: `Apply approved Recipe R&D draft ${draftId}`,
      beforeData: { currentRecipeVersionId: content.baseRecipeVersionId },
      afterData: { currentRecipeVersionId: versionId, versionNo: nextVersionNo },
      metadata: { rdRequestId: content.rdRequestId, aiDraftId: draftId },
      requestId: meta.requestId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }, client);

    await client.query("COMMIT");
    return {
      ok: true,
      rdRequestId: content.rdRequestId,
      draftId,
      recipeId: content.targetRecipeId,
      recipeVersionId: versionId,
      recipeVersionNo: nextVersionNo,
      status: "applied" as const,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
