import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECIPE_STATUSES = ["draft", "needs_review", "active", "inactive"] as const;
const REVIEW_DECISIONS = ["approved", "changes_requested"] as const;
const REVIEWABLE_WORKFLOW_STATUSES = ["draft", "changes_requested"] as const;
const RECIPE_INGREDIENT_CATALOG_GROUPS = [
  "tra",
  "siro",
  "sot",
  "sinh-to",
  "bot-sua-kem-beo",
  "milk-foam-kem-cheese",
  "tran-chau",
  "3q",
  "thach-rau-cau",
  "flan-pudding",
  "bot-tao-vi",
] as const;

type RecipeStatus = (typeof RECIPE_STATUSES)[number];
type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
type ReviewableWorkflowStatus = (typeof REVIEWABLE_WORKFLOW_STATUSES)[number];

type IngredientInput = {
  productName?: unknown;
  quantity?: unknown;
  unit?: unknown;
  note?: unknown;
  optional?: unknown;
  catalogVariantId?: unknown;
};

type StepInput = { title?: unknown; content?: unknown; imageUrl?: unknown };

type RecipeInput = {
  slug?: unknown;
  title?: unknown;
  shortDescription?: unknown;
  description?: unknown;
  recipeCategoryId?: unknown;
  relatedBrand?: unknown;
  coverImageUrl?: unknown;
  yieldQuantity?: unknown;
  yieldUnit?: unknown;
  sortOrder?: unknown;
  changeNote?: unknown;
  ingredients?: unknown;
  steps?: unknown;
};

type CatalogSnapshot = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  options: Record<string, unknown>;
  status: string;
  priceMode: string;
  priceLabel: string | null;
  isOrderable: boolean;
};

type NormalizedIngredientInput = {
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
  catalogVariantId: string | null;
};

type ResolvedIngredient = {
  productName: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
  catalogVariantId: string | null;
  catalogProductId: string | null;
  catalogSnapshot: CatalogSnapshot | null;
};

type NormalizedStep = { title: string | null; content: string; imageUrl: string | null };

type NormalizedRecipeInput = {
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  recipeCategoryId: string | null;
  relatedBrand: string | null;
  coverImageUrl: string | null;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  sortOrder: number;
  changeNote: string | null;
  ingredients: NormalizedIngredientInput[];
  steps: NormalizedStep[];
};

type ResolvedRecipeInput = Omit<NormalizedRecipeInput, "ingredients"> & {
  ingredients: ResolvedIngredient[];
};

type RecipeLockRow = {
  id: string;
  slug: string;
  status: RecipeStatus;
  currentVersionId: string | null;
  publishedVersionId: string | null;
};

type VersionLockRow = { id: string; workflowStatus: string };

type CatalogVariantRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  options: Record<string, unknown> | null;
  status: string;
  price_mode: string;
  price_label: string | null;
  is_orderable: boolean;
};

function readText(value: unknown, field: string, options: { required?: boolean; max?: number } = {}): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    if (options.required) {
      throw new OrderEngineError(`RECIPE_${field.toUpperCase()}_REQUIRED`, 400, `${field} is required.`);
    }
    return null;
  }
  if (options.max && normalized.length > options.max) {
    throw new OrderEngineError(`RECIPE_${field.toUpperCase()}_TOO_LONG`, 400, `${field} cannot exceed ${options.max} characters.`);
  }
  return normalized;
}

function readUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError(`INVALID_RECIPE_${field.toUpperCase()}`, 400, `${field} must be a UUID.`);
  }
  return normalized;
}

function normalizeRecipeId(recipeId: string): string {
  const normalized = recipeId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("INVALID_RECIPE_ID", 400, "recipeId must be a UUID.");
  }
  return normalized;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  if (!slug) {
    throw new OrderEngineError("RECIPE_SLUG_INVALID", 400, "A valid slug could not be generated.");
  }
  return slug;
}

function readPositiveDecimal(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000000) {
    throw new OrderEngineError(`RECIPE_${field.toUpperCase()}_INVALID`, 400, `${field} must be a positive number.`);
  }
  return Math.round(parsed * 1000) / 1000;
}

function readInteger(value: unknown, field: string, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value));
  if (!Number.isInteger(parsed) || parsed < -100000 || parsed > 100000) {
    throw new OrderEngineError(`RECIPE_${field.toUpperCase()}_INVALID`, 400, `${field} must be an integer.`);
  }
  return parsed;
}

function normalizeIngredients(value: unknown): NormalizedIngredientInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 250) {
    throw new OrderEngineError("RECIPE_INGREDIENTS_INVALID", 400, "ingredients must be an array with at most 250 items.");
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new OrderEngineError("RECIPE_INGREDIENT_INVALID", 400, `Ingredient ${index + 1} is invalid.`);
    }
    const input = entry as IngredientInput;
    const catalogVariantId = readUuid(input.catalogVariantId, "catalog_variant_id");
    const productName = readText(input.productName, "ingredient_product_name", { max: 240 });
    if (!catalogVariantId && !productName) {
      throw new OrderEngineError(
        "RECIPE_INGREDIENT_NAME_REQUIRED",
        400,
        `Ingredient ${index + 1} must have a catalog variant or a manual name.`,
      );
    }
    return {
      productName,
      quantity: readPositiveDecimal(input.quantity, "ingredient_quantity"),
      unit: readText(input.unit, "ingredient_unit", { max: 80 }),
      note: readText(input.note, "ingredient_note", { max: 1000 }),
      optional: input.optional === true,
      catalogVariantId,
    };
  });
}

function normalizeSteps(value: unknown): NormalizedStep[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) {
    throw new OrderEngineError("RECIPE_STEPS_INVALID", 400, "steps must be an array with at most 100 items.");
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new OrderEngineError("RECIPE_STEP_INVALID", 400, `Step ${index + 1} is invalid.`);
    }
    const input = entry as StepInput;
    return {
      title: readText(input.title, "step_title", { max: 240 }),
      content: readText(input.content, "step_content", { required: true, max: 10000 })!,
      imageUrl: readText(input.imageUrl, "step_image_url", { max: 2048 }),
    };
  });
}

function normalizeRecipe(input: RecipeInput, existingSlug?: string): NormalizedRecipeInput {
  const title = readText(input.title, "title", { required: true, max: 180 })!;
  return {
    slug: slugify(readText(input.slug, "slug", { max: 180 }) || existingSlug || title),
    title,
    shortDescription: readText(input.shortDescription, "short_description", { max: 600 }),
    description: readText(input.description, "description", { max: 20000 }),
    recipeCategoryId: readUuid(input.recipeCategoryId, "recipe_category_id"),
    relatedBrand: readText(input.relatedBrand, "related_brand", { max: 180 }),
    coverImageUrl: readText(input.coverImageUrl, "cover_image_url", { max: 2048 }),
    yieldQuantity: readPositiveDecimal(input.yieldQuantity, "yield_quantity"),
    yieldUnit: readText(input.yieldUnit, "yield_unit", { max: 80 }),
    sortOrder: readInteger(input.sortOrder, "sort_order"),
    changeNote: readText(input.changeNote, "change_note", { max: 2000 }),
    ingredients: normalizeIngredients(input.ingredients),
    steps: normalizeSteps(input.steps),
  };
}

function catalogIngredientLabel(row: CatalogVariantRow): string {
  return row.variant_name.trim().toLocaleLowerCase() === row.product_name.trim().toLocaleLowerCase()
    ? row.product_name
    : `${row.product_name} — ${row.variant_name}`;
}

async function resolveCatalogIngredients(
  client: PoolClient,
  ingredients: NormalizedIngredientInput[],
): Promise<ResolvedIngredient[]> {
  const ids = [...new Set(ingredients.flatMap((ingredient) => ingredient.catalogVariantId ? [ingredient.catalogVariantId] : []))];
  if (ids.length === 0) {
    return ingredients.map((ingredient) => ({
      ...ingredient,
      productName: ingredient.productName!,
      catalogProductId: null,
      catalogSnapshot: null,
    }));
  }

  const result = await client.query<CatalogVariantRow>(
    `SELECT
       variant.id::text AS variant_id,
       product.id::text AS product_id,
       product.name AS product_name,
       variant.name AS variant_name,
       variant.sku,
       variant.options,
       variant.status,
       variant.price_mode,
       variant.price_label,
       variant.is_orderable
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     WHERE variant.id = ANY($1::uuid[])
       AND product.catalog_version = 'hung-phat-v2'
       AND product.status = 'active'
       AND product.catalog_group_key = ANY($2::text[])
       AND variant.catalog_version = 'hung-phat-v2'
       AND variant.is_active = true
       AND variant.is_public = true
       AND variant.status IN ('active', 'market_price')`,
    [ids, RECIPE_INGREDIENT_CATALOG_GROUPS],
  );

  const rowsById = new Map(result.rows.map((row) => [row.variant_id, row]));
  const missing = ids.filter((id) => !rowsById.has(id));
  if (missing.length > 0) {
    throw new OrderEngineError(
      "RECIPE_CATALOG_VARIANT_UNAVAILABLE",
      400,
      "One or more selected catalog variants are unavailable.",
      { missingVariantIds: missing },
    );
  }

  return ingredients.map((ingredient) => {
    if (!ingredient.catalogVariantId) {
      return {
        ...ingredient,
        productName: ingredient.productName!,
        catalogProductId: null,
        catalogSnapshot: null,
      };
    }
    const row = rowsById.get(ingredient.catalogVariantId)!;
    const catalogSnapshot: CatalogSnapshot = {
      variantId: row.variant_id,
      productId: row.product_id,
      productName: row.product_name,
      variantName: row.variant_name,
      sku: row.sku,
      options: row.options || {},
      status: row.status,
      priceMode: row.price_mode,
      priceLabel: row.price_label,
      isOrderable: row.is_orderable === true,
    };
    return {
      ...ingredient,
      productName: catalogIngredientLabel(row),
      catalogProductId: row.product_id,
      catalogSnapshot,
    };
  });
}

function toRecipeSnapshot(recipe: ResolvedRecipeInput) {
  return {
    slug: recipe.slug,
    title: recipe.title,
    shortDescription: recipe.shortDescription,
    description: recipe.description,
    recipeCategoryId: recipe.recipeCategoryId,
    relatedBrand: recipe.relatedBrand,
    coverImageUrl: recipe.coverImageUrl,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    sortOrder: recipe.sortOrder,
    ingredients: recipe.ingredients.map((ingredient) => ({
      productName: ingredient.productName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      note: ingredient.note,
      optional: ingredient.optional,
      catalogVariantId: ingredient.catalogVariantId,
      catalogProductId: ingredient.catalogProductId,
      catalogSnapshot: ingredient.catalogSnapshot,
    })),
    steps: recipe.steps,
  };
}

function normalizeReviewDecision(value: unknown): ReviewDecision {
  if (typeof value === "string" && REVIEW_DECISIONS.includes(value as ReviewDecision)) {
    return value as ReviewDecision;
  }
  throw new OrderEngineError("RECIPE_REVIEW_DECISION_INVALID", 400, "decision must be approved or changes_requested.");
}

function normalizeReviewNote(value: unknown, required: boolean): string | null {
  const note = readText(value, "review_note", { max: 2000 });
  if (required && !note) {
    throw new OrderEngineError("RECIPE_REVIEW_NOTE_REQUIRED", 400, "A review note is required when changes are requested.");
  }
  return note;
}

async function assertStoredAdmin(client: PoolClient, identity: StaffIdentity): Promise<void> {
  const result = await client.query<{ role: string; is_active: boolean }>(
    "SELECT role, is_active FROM staff_users WHERE id = $1 FOR SHARE",
    [identity.staffId],
  );
  const staff = result.rows[0];
  if (!staff || staff.role !== "admin" || staff.is_active !== true) {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
}

async function assertRecipeCategory(client: PoolClient, recipeCategoryId: string | null): Promise<void> {
  if (!recipeCategoryId) return;
  const result = await client.query("SELECT id FROM recipe_categories WHERE id = $1 AND is_active = true", [recipeCategoryId]);
  if (!result.rows[0]) {
    throw new OrderEngineError("RECIPE_CATEGORY_NOT_FOUND", 400, "Recipe category was not found or is inactive.");
  }
}

async function lockRecipe(client: PoolClient, recipeId: string): Promise<RecipeLockRow> {
  const result = await client.query<RecipeLockRow>(
    `SELECT
       id::text,
       slug,
       status,
       current_version_id::text AS "currentVersionId",
       published_version_id::text AS "publishedVersionId"
     FROM recipes
     WHERE id = $1
     FOR UPDATE`,
    [recipeId],
  );
  const recipe = result.rows[0];
  if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
  return recipe;
}

async function lockCurrentVersion(client: PoolClient, recipe: RecipeLockRow): Promise<VersionLockRow> {
  if (!recipe.currentVersionId) {
    throw new OrderEngineError("RECIPE_VERSION_MISSING", 409, "Recipe does not have a current version.");
  }
  const result = await client.query<VersionLockRow>(
    `SELECT id::text, workflow_status AS "workflowStatus"
     FROM recipe_versions
     WHERE id = $1 AND recipe_id = $2
     FOR UPDATE`,
    [recipe.currentVersionId, recipe.id],
  );
  const version = result.rows[0];
  if (!version) throw new OrderEngineError("RECIPE_VERSION_MISSING", 409, "Recipe current version was not found.");
  return version;
}

async function assertRecipeReadyForReview(client: PoolClient, recipeId: string): Promise<void> {
  const result = await client.query<{
    catalog_variant_id: string | null;
    variant_active: boolean | null;
    variant_public: boolean | null;
    variant_status: string | null;
    product_status: string | null;
  }>(
    `SELECT
       ingredient.catalog_variant_id::text,
       variant.is_active AS variant_active,
       variant.is_public AS variant_public,
       variant.status AS variant_status,
       product.status AS product_status
     FROM recipe_ingredients ingredient
     LEFT JOIN catalog_variants variant ON variant.id = ingredient.catalog_variant_id
     LEFT JOIN catalog_products product ON product.id = ingredient.catalog_product_id
     WHERE ingredient.recipe_id = $1
       AND ingredient.catalog_variant_id IS NOT NULL`,
    [recipeId],
  );

  if (result.rows.length === 0) {
    throw new OrderEngineError(
      "RECIPE_CATALOG_LINK_REQUIRED",
      409,
      "A recipe must include at least one linked catalog ingredient before review.",
    );
  }

  const unavailable = result.rows
    .filter((row) => row.variant_active !== true || row.variant_public !== true || !["active", "market_price"].includes(row.variant_status || "") || row.product_status !== "active")
    .map((row) => row.catalog_variant_id);
  if (unavailable.length > 0) {
    throw new OrderEngineError(
      "RECIPE_CATALOG_VARIANT_UNAVAILABLE",
      409,
      "A linked catalog variant is no longer available.",
      { unavailableVariantIds: unavailable },
    );
  }
}

async function replaceRecipeContent(
  client: PoolClient,
  recipeId: string,
  ingredients: ResolvedIngredient[],
  steps: NormalizedStep[],
): Promise<void> {
  await client.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]);
  await client.query("DELETE FROM recipe_steps WHERE recipe_id = $1", [recipeId]);

  for (const [index, ingredient] of ingredients.entries()) {
    await client.query(
      `INSERT INTO recipe_ingredients (
         recipe_id,
         product_name,
         quantity,
         unit,
         note,
         optional,
         catalog_product_id,
         catalog_variant_id,
         catalog_snapshot,
         sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        recipeId,
        ingredient.productName,
        ingredient.quantity,
        ingredient.unit,
        ingredient.note,
        ingredient.optional,
        ingredient.catalogProductId,
        ingredient.catalogVariantId,
        ingredient.catalogSnapshot ? JSON.stringify(ingredient.catalogSnapshot) : null,
        index,
      ],
    );
  }

  for (const [index, step] of steps.entries()) {
    await client.query(
      `INSERT INTO recipe_steps (recipe_id, step_no, title, content, image_url)
       VALUES ($1,$2,$3,$4,$5)`,
      [recipeId, index + 1, step.title, step.content, step.imageUrl],
    );
  }
}

async function createRecipeVersion(
  client: PoolClient,
  recipeId: string,
  snapshot: ReturnType<typeof toRecipeSnapshot>,
  staffId: string,
  changeNote: string | null,
): Promise<string> {
  const nextVersion = await client.query<{ next_version_no: number }>(
    "SELECT COALESCE(MAX(version_no), 0)::int + 1 AS next_version_no FROM recipe_versions WHERE recipe_id = $1",
    [recipeId],
  );
  const versionNo = nextVersion.rows[0]?.next_version_no ?? 1;
  const result = await client.query<{ id: string }>(
    `INSERT INTO recipe_versions (
       recipe_id,
       version_no,
       workflow_status,
       snapshot,
       change_note,
       created_by_staff_id
     ) VALUES ($1,$2,'draft',$3::jsonb,$4,$5)
     RETURNING id::text`,
    [recipeId, versionNo, JSON.stringify(snapshot), changeNote, staffId],
  );
  return result.rows[0].id;
}

async function loadRecipeDetail(db: Pool | PoolClient, recipeId: string) {
  const recipeResult = await db.query(
    `SELECT
       recipe.id::text,
       recipe.slug,
       recipe.title,
       recipe.short_description AS "shortDescription",
       recipe.description,
       recipe.recipe_category_id::text AS "recipeCategoryId",
       category.name AS "recipeCategoryName",
       recipe.related_brand AS "relatedBrand",
       recipe.cover_image_url AS "coverImageUrl",
       recipe.yield_quantity::text AS "yieldQuantity",
       recipe.yield_unit AS "yieldUnit",
       recipe.source_confidence AS "sourceConfidence",
       recipe.status,
       recipe.sort_order AS "sortOrder",
       recipe.archived_at AS "archivedAt",
       recipe.current_version_id::text AS "currentVersionId",
       current_version.version_no AS "currentVersionNo",
       current_version.workflow_status AS "workflowStatus",
       current_version.review_note AS "reviewNote",
       current_version.reviewed_at AS "reviewedAt",
       recipe.published_version_id::text AS "publishedVersionId",
       recipe.published_at AS "publishedAt",
       recipe.created_at AS "createdAt",
       recipe.updated_at AS "updatedAt"
     FROM recipes recipe
     LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
     LEFT JOIN recipe_versions current_version ON current_version.id = recipe.current_version_id
     WHERE recipe.id = $1`,
    [recipeId],
  );
  const recipe = recipeResult.rows[0];
  if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found.");

  const [ingredients, steps] = await Promise.all([
    db.query(
      `SELECT
         id::text,
         product_id::text AS "legacyProductId",
         product_name AS "productName",
         quantity::text,
         unit,
         note,
         optional,
         catalog_product_id::text AS "catalogProductId",
         catalog_variant_id::text AS "catalogVariantId",
         catalog_snapshot AS "catalogSnapshot",
         sort_order AS "sortOrder"
       FROM recipe_ingredients
       WHERE recipe_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [recipeId],
    ),
    db.query(
      `SELECT id::text, step_no AS "stepNo", title, content, image_url AS "imageUrl"
       FROM recipe_steps
       WHERE recipe_id = $1
       ORDER BY step_no ASC, id ASC`,
      [recipeId],
    ),
  ]);

  return { recipe: { ...recipe, ingredients: ingredients.rows, steps: steps.rows } };
}

export async function listAdminRecipes(
  identity: StaffIdentity,
  input: { status?: unknown; search?: unknown; limit?: number } = {},
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const requestedStatus = typeof input.status === "string" && input.status.trim() ? input.status.trim() : null;
  if (requestedStatus && !RECIPE_STATUSES.includes(requestedStatus as RecipeStatus)) {
    throw new OrderEngineError("RECIPE_STATUS_FILTER_INVALID", 400, "Unknown recipe status.");
  }
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const requestedLimit = typeof input.limit === "number" ? input.limit : 50;
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 100);
  const values: unknown[] = [];
  const where: string[] = [];
  if (requestedStatus) {
    values.push(requestedStatus);
    where.push(`recipe.status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    where.push(`(recipe.title ILIKE $${values.length} OR recipe.slug ILIKE $${values.length})`);
  }
  values.push(limit);

  const result = await db.query(
    `SELECT
       recipe.id::text,
       recipe.slug,
       recipe.title,
       recipe.short_description AS "shortDescription",
       recipe.status,
       current_version.workflow_status AS "workflowStatus",
       current_version.version_no AS "currentVersionNo",
       recipe.published_version_id::text AS "publishedVersionId",
       recipe.sort_order AS "sortOrder",
       recipe.yield_quantity::text AS "yieldQuantity",
       recipe.yield_unit AS "yieldUnit",
       category.name AS "recipeCategoryName",
       recipe.updated_at AS "updatedAt",
       COUNT(DISTINCT ingredient.id)::int AS "ingredientCount",
       COUNT(DISTINCT ingredient.catalog_variant_id)::int AS "catalogIngredientCount",
       COUNT(DISTINCT step.id)::int AS "stepCount",
       COUNT(*) OVER()::int AS "totalCount"
     FROM recipes recipe
     LEFT JOIN recipe_categories category ON category.id = recipe.recipe_category_id
     LEFT JOIN recipe_versions current_version ON current_version.id = recipe.current_version_id
     LEFT JOIN recipe_ingredients ingredient ON ingredient.recipe_id = recipe.id
     LEFT JOIN recipe_steps step ON step.recipe_id = recipe.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY recipe.id, category.id, current_version.id
     ORDER BY recipe.updated_at DESC, recipe.id DESC
     LIMIT $${values.length}`,
    values,
  );

  return {
    recipes: result.rows.map(({ totalCount: _totalCount, ...recipe }) => recipe),
    total: Number(result.rows[0]?.totalCount ?? 0),
  };
}

export async function getAdminRecipe(identity: StaffIdentity, recipeId: string, db: Pool | PoolClient = getDb()) {
  requireAdmin(identity);
  return loadRecipeDetail(db, normalizeRecipeId(recipeId));
}

export async function listAdminRecipeVersions(identity: StaffIdentity, recipeId: string, db: Pool = getDb()) {
  requireAdmin(identity);
  const id = normalizeRecipeId(recipeId);
  const result = await db.query(
    `SELECT
       version.id::text,
       version.version_no AS "versionNo",
       version.workflow_status AS "workflowStatus",
       version.change_note AS "changeNote",
       version.review_note AS "reviewNote",
       version.created_at AS "createdAt",
       version.reviewed_at AS "reviewedAt",
       version.published_at AS "publishedAt",
       creator.name AS "createdByName",
       reviewer.name AS "reviewedByName",
       publisher.name AS "publishedByName",
       (version.id = recipe.current_version_id) AS "isCurrent",
       (version.id = recipe.published_version_id) AS "isPublished"
     FROM recipe_versions version
     JOIN recipes recipe ON recipe.id = version.recipe_id
     LEFT JOIN staff_users creator ON creator.id = version.created_by_staff_id
     LEFT JOIN staff_users reviewer ON reviewer.id = version.reviewed_by_staff_id
     LEFT JOIN staff_users publisher ON publisher.id = version.published_by_staff_id
     WHERE version.recipe_id = $1
     ORDER BY version.version_no DESC`,
    [id],
  );
  return { versions: result.rows };
}

export async function searchRecipeCatalogOptions(
  identity: StaffIdentity,
  input: { search?: unknown; limit?: unknown },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const search = typeof input.search === "string" ? input.search.trim() : "";
  if (search.length < 2) {
    throw new OrderEngineError("RECIPE_CATALOG_QUERY_TOO_SHORT", 400, "Search query must contain at least 2 characters.");
  }
  const parsedLimit = Number.parseInt(String(input.limit ?? "20"), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 30) : 20;
  const result = await db.query(
    `SELECT
       variant.id::text AS "variantId",
       product.id::text AS "productId",
       product.name AS "productName",
       product.brand AS brand,
       variant.name AS "variantName",
       variant.sku,
       variant.options,
       variant.price_mode AS "priceMode",
       variant.price_label AS "priceLabel",
       variant.is_orderable AS "isOrderable"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     WHERE product.catalog_version = 'hung-phat-v2'
       AND product.status = 'active'
       AND product.catalog_group_key = ANY($2::text[])
       AND variant.catalog_version = 'hung-phat-v2'
       AND variant.is_active = true
       AND variant.is_public = true
       AND variant.status IN ('active', 'market_price')
       AND product.catalog_group_key = ANY($2::text[])
       AND (
         product.name ILIKE $1
         OR variant.name ILIKE $1
         OR variant.sku ILIKE $1
         OR COALESCE(product.brand, '') ILIKE $1
       )
     ORDER BY product.sort_order ASC, variant.sort_order ASC, variant.sku ASC
     LIMIT $3`,
    [`%${search}%`, RECIPE_INGREDIENT_CATALOG_GROUPS, limit],
  );
  return { items: result.rows };
}

export async function createAdminRecipe(identity: StaffIdentity, input: RecipeInput, db: Pool = getDb()) {
  requireAdmin(identity);
  const recipeInput = normalizeRecipe(input);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    await assertRecipeCategory(client, recipeInput.recipeCategoryId);
    const recipe: ResolvedRecipeInput = {
      ...recipeInput,
      ingredients: await resolveCatalogIngredients(client, recipeInput.ingredients),
    };

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO recipes (
         slug,
         title,
         short_description,
         description,
         recipe_category_id,
         related_brand,
         cover_image_url,
         yield_quantity,
         yield_unit,
         status,
         sort_order,
         created_by_staff_id,
         updated_by_staff_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$11)
       RETURNING id::text`,
      [
        recipe.slug,
        recipe.title,
        recipe.shortDescription,
        recipe.description,
        recipe.recipeCategoryId,
        recipe.relatedBrand,
        recipe.coverImageUrl,
        recipe.yieldQuantity,
        recipe.yieldUnit,
        recipe.sortOrder,
        identity.staffId,
      ],
    );
    const recipeId = inserted.rows[0].id;
    await replaceRecipeContent(client, recipeId, recipe.ingredients, recipe.steps);
    const versionId = await createRecipeVersion(client, recipeId, toRecipeSnapshot(recipe), identity.staffId, recipe.changeNote);
    await client.query("UPDATE recipes SET current_version_id = $2 WHERE id = $1", [recipeId, versionId]);
    await client.query("COMMIT");
    return loadRecipeDetail(db, recipeId);
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") {
      throw new OrderEngineError("RECIPE_SLUG_CONFLICT", 409, "Recipe slug is already in use.");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminRecipe(identity: StaffIdentity, recipeId: string, input: RecipeInput, db: Pool = getDb()) {
  requireAdmin(identity);
  const id = normalizeRecipeId(recipeId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const existing = await lockRecipe(client, id);
    if (existing.status === "inactive") {
      throw new OrderEngineError("RECIPE_ARCHIVED", 409, "Archived recipes cannot be edited.");
    }
    if (existing.currentVersionId) {
      const currentVersion = await lockCurrentVersion(client, existing);
      if (["in_review", "approved"].includes(currentVersion.workflowStatus)) {
        throw new OrderEngineError("RECIPE_REVIEW_LOCKED", 409, "Recipe is in review or approved. Request changes before editing it.");
      }
    }

    const recipeInput = normalizeRecipe(input, existing.slug);
    await assertRecipeCategory(client, recipeInput.recipeCategoryId);
    const recipe: ResolvedRecipeInput = {
      ...recipeInput,
      ingredients: await resolveCatalogIngredients(client, recipeInput.ingredients),
    };
    const nextStatus: RecipeStatus = existing.publishedVersionId ? "active" : "draft";

    await client.query(
      `UPDATE recipes SET
         slug = $2,
         title = $3,
         short_description = $4,
         description = $5,
         recipe_category_id = $6,
         related_brand = $7,
         cover_image_url = $8,
         yield_quantity = $9,
         yield_unit = $10,
         status = $11,
         sort_order = $12,
         updated_by_staff_id = $13,
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        recipe.slug,
        recipe.title,
        recipe.shortDescription,
        recipe.description,
        recipe.recipeCategoryId,
        recipe.relatedBrand,
        recipe.coverImageUrl,
        recipe.yieldQuantity,
        recipe.yieldUnit,
        nextStatus,
        recipe.sortOrder,
        identity.staffId,
      ],
    );
    await replaceRecipeContent(client, id, recipe.ingredients, recipe.steps);
    const versionId = await createRecipeVersion(client, id, toRecipeSnapshot(recipe), identity.staffId, recipe.changeNote);
    await client.query("UPDATE recipes SET current_version_id = $2 WHERE id = $1", [id, versionId]);
    await client.query("COMMIT");
    return loadRecipeDetail(db, id);
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === "23505") {
      throw new OrderEngineError("RECIPE_SLUG_CONFLICT", 409, "Recipe slug is already in use.");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function submitRecipeForReview(identity: StaffIdentity, recipeId: string, db: Pool = getDb()) {
  requireAdmin(identity);
  const id = normalizeRecipeId(recipeId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const recipe = await lockRecipe(client, id);
    if (recipe.status === "inactive") {
      throw new OrderEngineError("RECIPE_ARCHIVED", 409, "Archived recipes cannot be reviewed.");
    }
    const version = await lockCurrentVersion(client, recipe);
    if (!REVIEWABLE_WORKFLOW_STATUSES.includes(version.workflowStatus as ReviewableWorkflowStatus)) {
      throw new OrderEngineError("RECIPE_VERSION_NOT_REVIEWABLE", 409, "Current recipe version cannot be submitted for review.");
    }
    await assertRecipeReadyForReview(client, id);
    await client.query(
      `UPDATE recipe_versions
       SET workflow_status = 'in_review', review_note = NULL, reviewed_by_staff_id = NULL, reviewed_at = NULL
       WHERE id = $1`,
      [version.id],
    );
    const nextStatus: RecipeStatus = recipe.publishedVersionId ? "active" : "needs_review";
    await client.query(
      "UPDATE recipes SET status = $2, updated_by_staff_id = $3, updated_at = now() WHERE id = $1",
      [id, nextStatus, identity.staffId],
    );
    await client.query("COMMIT");
    return loadRecipeDetail(db, id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewRecipe(
  identity: StaffIdentity,
  recipeId: string,
  input: { decision?: unknown; note?: unknown },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const id = normalizeRecipeId(recipeId);
  const decision = normalizeReviewDecision(input.decision);
  const note = normalizeReviewNote(input.note, decision === "changes_requested");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const recipe = await lockRecipe(client, id);
    if (recipe.status === "inactive") {
      throw new OrderEngineError("RECIPE_ARCHIVED", 409, "Archived recipes cannot be reviewed.");
    }
    const version = await lockCurrentVersion(client, recipe);
    if (version.workflowStatus !== "in_review") {
      throw new OrderEngineError("RECIPE_VERSION_NOT_IN_REVIEW", 409, "Current recipe version is not in review.");
    }

    if (decision === "approved") {
      await client.query(
        `UPDATE recipe_versions
         SET workflow_status = 'approved', reviewed_by_staff_id = $2, reviewed_at = now(), review_note = $3
         WHERE id = $1`,
        [version.id, identity.staffId, note],
      );
    } else {
      await client.query(
        `UPDATE recipe_versions
         SET workflow_status = 'changes_requested', reviewed_by_staff_id = $2, reviewed_at = now(), review_note = $3
         WHERE id = $1`,
        [version.id, identity.staffId, note],
      );
      const nextStatus: RecipeStatus = recipe.publishedVersionId ? "active" : "draft";
      await client.query(
        "UPDATE recipes SET status = $2, updated_by_staff_id = $3, updated_at = now() WHERE id = $1",
        [id, nextStatus, identity.staffId],
      );
    }

    await client.query("COMMIT");
    return loadRecipeDetail(db, id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function publishRecipe(identity: StaffIdentity, recipeId: string, db: Pool = getDb()) {
  requireAdmin(identity);
  const id = normalizeRecipeId(recipeId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const recipe = await lockRecipe(client, id);
    if (recipe.status === "inactive") {
      throw new OrderEngineError("RECIPE_ARCHIVED", 409, "Archived recipes cannot be published.");
    }
    const version = await lockCurrentVersion(client, recipe);
    if (version.workflowStatus !== "approved") {
      throw new OrderEngineError("RECIPE_NOT_APPROVED", 409, "Current recipe version must be approved before publication.");
    }
    await assertRecipeReadyForReview(client, id);
    await client.query(
      `UPDATE recipe_versions
       SET workflow_status = 'published', published_by_staff_id = $2, published_at = now()
       WHERE id = $1`,
      [version.id, identity.staffId],
    );
    await client.query(
      `UPDATE recipes
       SET status = 'active',
           published_version_id = $2,
           published_by_staff_id = $3,
           published_at = now(),
           updated_by_staff_id = $3,
           updated_at = now()
       WHERE id = $1`,
      [id, version.id, identity.staffId],
    );
    await client.query("COMMIT");
    return loadRecipeDetail(db, id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveAdminRecipe(identity: StaffIdentity, recipeId: string, db: Pool = getDb()) {
  requireAdmin(identity);
  const id = normalizeRecipeId(recipeId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const recipe = await lockRecipe(client, id);
    if (recipe.status === "inactive") {
      throw new OrderEngineError("RECIPE_ALREADY_ARCHIVED", 409, "Recipe is already archived.");
    }
    await client.query(
      `UPDATE recipes
       SET status = 'inactive',
           archived_at = now(),
           archived_by_staff_id = $2,
           updated_by_staff_id = $2,
           updated_at = now()
       WHERE id = $1`,
      [id, identity.staffId],
    );
    await client.query("COMMIT");
    return loadRecipeDetail(db, id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
