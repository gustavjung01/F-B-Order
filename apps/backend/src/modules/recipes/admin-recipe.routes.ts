import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";

export type AdminRecipeIdentityResolver = (req: Request) => Promise<RequestIdentity>;

type RecipeStatus = "draft" | "in_review" | "published" | "archived";
type RecipeUnit = "g" | "kg" | "ml" | "l" | "piece" | "portion" | "pack";

type IngredientInput = {
  name: string;
  quantity: number;
  unit: RecipeUnit;
  optional: boolean;
  note: string | null;
};

type StepInput = {
  title: string | null;
  instruction: string;
  durationSeconds: number | null;
  warning: string | null;
  successMarker: string | null;
};

export type AdminRecipeDocument = {
  slug: string;
  title: string;
  shortDescription: string;
  aliases: string[];
  visibility: "public" | "internal";
  difficulty: "easy" | "medium" | "hard";
  prepMinutes: number;
  cookMinutes: number;
  yieldQuantity: number;
  yieldUnit: RecipeUnit;
  categoryId: string | null;
  tagIds: string[];
  ingredients: IngredientInput[];
  steps: StepInput[];
};

class AdminRecipeError extends Error {
  constructor(readonly code: string, readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNITS = new Set<RecipeUnit>(["g", "kg", "ml", "l", "piece", "portion", "pack"]);

function fail(code: string, status: number, message: string, details?: unknown): never {
  throw new AdminRecipeError(code, status, message, details);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_RECIPE_INPUT", 400, "Body must be an object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, required = false, max = 10000): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) fail("INVALID_RECIPE_INPUT", 400, `${field} is required.`);
  if (normalized.length > max) fail("INVALID_RECIPE_INPUT", 400, `${field} is too long.`);
  return normalized;
}

function numberValue(value: unknown, field: string, min = 0, max = 1_000_000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail("INVALID_RECIPE_INPUT", 400, `${field} is out of range.`);
  return parsed;
}

function uuid(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(normalized)) fail("INVALID_RECIPE_INPUT", 400, `${field} must be a UUID.`);
  return normalized;
}

function stringArray(value: unknown, field: string, maxItems = 100): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) fail("INVALID_RECIPE_INPUT", 400, `${field} is invalid.`);
  return [...new Set(value.map((item, index) => text(item, `${field}[${index}]`, true, 500)))];
}

export function normalizeAdminRecipeDocument(value: unknown): AdminRecipeDocument {
  const input = object(value);
  const slug = text(input.slug, "slug", true, 180).toLowerCase();
  if (!SLUG.test(slug)) fail("INVALID_RECIPE_SLUG", 400, "Slug is invalid.");
  const yieldUnit = text(input.yieldUnit, "yieldUnit", true, 20) as RecipeUnit;
  if (!UNITS.has(yieldUnit)) fail("INVALID_RECIPE_INPUT", 400, "yieldUnit is invalid.");

  const ingredients = Array.isArray(input.ingredients) ? input.ingredients.map((raw, index): IngredientInput => {
    const ingredient = object(raw);
    const unit = text(ingredient.unit, `ingredients[${index}].unit`, true, 20) as RecipeUnit;
    if (!UNITS.has(unit)) fail("INVALID_RECIPE_INPUT", 400, `ingredients[${index}].unit is invalid.`);
    return {
      name: text(ingredient.name, `ingredients[${index}].name`, true, 500),
      quantity: numberValue(ingredient.quantity, `ingredients[${index}].quantity`, 0.0001),
      unit,
      optional: ingredient.optional === true,
      note: text(ingredient.note, `ingredients[${index}].note`, false, 4000) || null,
    };
  }) : [];

  const steps = Array.isArray(input.steps) ? input.steps.map((raw, index): StepInput => {
    const step = object(raw);
    return {
      title: text(step.title, `steps[${index}].title`, false, 500) || null,
      instruction: text(step.instruction, `steps[${index}].instruction`, true, 10000),
      durationSeconds: step.durationSeconds === null || step.durationSeconds === undefined
        ? null
        : numberValue(step.durationSeconds, `steps[${index}].durationSeconds`, 0, 604800),
      warning: text(step.warning, `steps[${index}].warning`, false, 4000) || null,
      successMarker: text(step.successMarker, `steps[${index}].successMarker`, false, 4000) || null,
    };
  }) : [];

  return {
    slug,
    title: text(input.title, "title", true, 500),
    shortDescription: text(input.shortDescription, "shortDescription", false, 4000),
    aliases: stringArray(input.aliases, "aliases"),
    visibility: input.visibility === "public" ? "public" : "internal",
    difficulty: input.difficulty === "easy" || input.difficulty === "hard" ? input.difficulty : "medium",
    prepMinutes: numberValue(input.prepMinutes ?? 0, "prepMinutes", 0, 100000),
    cookMinutes: numberValue(input.cookMinutes ?? 0, "cookMinutes", 0, 100000),
    yieldQuantity: numberValue(input.yieldQuantity, "yieldQuantity", 0.0001),
    yieldUnit,
    categoryId: uuid(input.categoryId, "categoryId", true),
    tagIds: stringArray(input.tagIds, "tagIds").map((item, index) => uuid(item, `tagIds[${index}]`) as string),
    ingredients,
    steps,
  };
}

async function assertStoredAdmin(client: PoolClient, identity: StaffIdentity) {
  const result = await client.query<{ role: string; is_active: boolean }>(
    `SELECT role, is_active FROM staff_users WHERE id = $1::uuid FOR SHARE`,
    [identity.staffId],
  );
  if (!result.rows[0] || result.rows[0].role !== "admin" || result.rows[0].is_active !== true) {
    fail("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
}

async function transaction<T>(identity: StaffIdentity, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const pgError = error as { code?: string; constraint?: string };
    if (pgError.code === "23505" && pgError.constraint?.includes("slug")) {
      fail("RECIPE_SLUG_CONFLICT", 409, "Recipe slug already exists.");
    }
    throw error;
  } finally {
    client.release();
  }
}

async function validateRelations(client: PoolClient, document: AdminRecipeDocument) {
  if (document.categoryId) {
    const category = await client.query(`SELECT 1 FROM recipe_categories WHERE id = $1::uuid`, [document.categoryId]);
    if (!category.rowCount) fail("RECIPE_CATEGORY_NOT_FOUND", 400, "Recipe category was not found.");
  }
  if (document.tagIds.length) {
    const tags = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM recipe_tags WHERE id = ANY($1::uuid[])`,
      [document.tagIds],
    );
    if (Number(tags.rows[0]?.count) !== document.tagIds.length) fail("RECIPE_TAG_NOT_FOUND", 400, "Recipe tag was not found.");
  }
}

async function replaceDocument(client: PoolClient, recipeId: string, document: AdminRecipeDocument) {
  await validateRelations(client, document);
  await client.query(
    `UPDATE recipes SET slug=$2,title=$3,short_description=$4,aliases=$5::jsonb,
      visibility=$6,difficulty=$7,prep_minutes=$8,cook_minutes=$9,yield_quantity=$10,
      yield_unit=$11,recipe_category_id=$12::uuid,updated_at=now()
     WHERE id=$1::uuid`,
    [recipeId, document.slug, document.title, document.shortDescription || null, JSON.stringify(document.aliases), document.visibility,
      document.difficulty, document.prepMinutes, document.cookMinutes, document.yieldQuantity, document.yieldUnit, document.categoryId],
  );
  await client.query(`DELETE FROM recipe_tag_links WHERE recipe_id=$1::uuid`, [recipeId]);
  await client.query(`DELETE FROM recipe_steps WHERE recipe_id=$1::uuid`, [recipeId]);
  await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id=$1::uuid`, [recipeId]);
  for (const tagId of document.tagIds) {
    await client.query(`INSERT INTO recipe_tag_links(recipe_id,tag_id) VALUES($1::uuid,$2::uuid)`, [recipeId, tagId]);
  }
  for (const [index, ingredient] of document.ingredients.entries()) {
    await client.query(
      `INSERT INTO recipe_ingredients(recipe_id,product_name,quantity,unit,note,optional,sort_order,
       name,source_type,usage_quantity,usage_unit,is_optional,is_cart_ready,provenance_source)
       VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$2,'external',$3,$4,$6,false,'human')`,
      [recipeId, ingredient.name, ingredient.quantity, ingredient.unit, ingredient.note, ingredient.optional, index + 1],
    );
  }
  for (const [index, step] of document.steps.entries()) {
    await client.query(
      `INSERT INTO recipe_steps(recipe_id,step_no,title,content,instruction,duration_seconds,success_marker,warning,sort_order,provenance_source)
       VALUES($1::uuid,$2,$3,$4,$4,$5,$6,$7,$2,'human')`,
      [recipeId, index + 1, step.title, step.instruction, step.durationSeconds, step.successMarker, step.warning],
    );
  }
}

async function lockRecipe(client: PoolClient, recipeId: string) {
  const result = await client.query<{ status: RecipeStatus }>(`SELECT status FROM recipes WHERE id=$1::uuid FOR UPDATE`, [recipeId]);
  if (!result.rows[0]) fail("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
  return result.rows[0];
}

async function loadRecipe(client: { query: PoolClient["query"] }, recipeId: string) {
  const result = await client.query(
    `SELECT id::text,slug,title,COALESCE(short_description,'') AS "shortDescription",aliases,
      visibility,difficulty,prep_minutes AS "prepMinutes",cook_minutes AS "cookMinutes",
      yield_quantity::float8 AS "yieldQuantity",yield_unit AS "yieldUnit",
      recipe_category_id::text AS "categoryId",status,current_version AS "currentVersion",
      published_at AS "publishedAt",archived_at AS "archivedAt"
     FROM recipes WHERE id=$1::uuid`,
    [recipeId],
  );
  if (!result.rows[0]) fail("RECIPE_NOT_FOUND", 404, "Recipe was not found.");
  const [ingredients, steps, tags] = await Promise.all([
    client.query(`SELECT name,usage_quantity::float8 AS quantity,usage_unit AS unit,is_optional AS optional,note
      FROM recipe_ingredients WHERE recipe_id=$1::uuid ORDER BY sort_order,id`, [recipeId]),
    client.query(`SELECT title,instruction,duration_seconds AS "durationSeconds",warning,success_marker AS "successMarker"
      FROM recipe_steps WHERE recipe_id=$1::uuid ORDER BY sort_order,id`, [recipeId]),
    client.query<{ tag_id: string }>(`SELECT tag_id::text FROM recipe_tag_links WHERE recipe_id=$1::uuid ORDER BY tag_id`, [recipeId]),
  ]);
  return { ...result.rows[0], ingredients: ingredients.rows, steps: steps.rows, tagIds: tags.rows.map((row) => row.tag_id) };
}

function editable(recipe: Record<string, unknown>) {
  const copy = { ...recipe };
  for (const key of ["id", "status", "currentVersion", "publishedAt", "archivedAt"]) delete copy[key];
  return copy;
}

function findings(document: AdminRecipeDocument) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!document.shortDescription) errors.push("SHORT_DESCRIPTION_REQUIRED");
  if (!document.ingredients.length) errors.push("INGREDIENTS_REQUIRED");
  if (!document.steps.length) errors.push("STEPS_REQUIRED");
  if (!document.aliases.length) warnings.push("ALIASES_EMPTY");
  return { errors, warnings };
}

export async function createAdminRecipe(identity: StaffIdentity, body: unknown) {
  const document = normalizeAdminRecipeDocument(body);
  return transaction(identity, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO recipes(slug,title,short_description,status,visibility,difficulty,prep_minutes,cook_minutes,
       yield_quantity,yield_unit,recipe_category_id,created_by_staff_id,provenance_source)
       VALUES($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10::uuid,$11::uuid,'human') RETURNING id::text`,
      [document.slug, document.title, document.shortDescription || null, document.visibility, document.difficulty,
        document.prepMinutes, document.cookMinutes, document.yieldQuantity, document.yieldUnit, document.categoryId, identity.staffId],
    );
    await replaceDocument(client, inserted.rows[0].id, document);
    return { recipe: await loadRecipe(client, inserted.rows[0].id) };
  });
}

export async function updateAdminRecipe(identity: StaffIdentity, recipeId: string, patch: unknown) {
  return transaction(identity, async (client) => {
    const state = await lockRecipe(client, recipeId);
    if (state.status === "published" || state.status === "archived") fail("RECIPE_NOT_EDITABLE", 409, "Restore recipe before editing.");
    const current = await loadRecipe(client, recipeId);
    const document = normalizeAdminRecipeDocument({ ...editable(current), ...object(patch) });
    await replaceDocument(client, recipeId, document);
    await client.query(`UPDATE recipes SET status='draft',approved_by_staff_id=NULL WHERE id=$1::uuid`, [recipeId]);
    return { recipe: await loadRecipe(client, recipeId) };
  });
}

export async function submitAdminRecipeReview(identity: StaffIdentity, recipeId: string) {
  return transaction(identity, async (client) => {
    const state = await lockRecipe(client, recipeId);
    if (state.status !== "draft") fail("INVALID_RECIPE_TRANSITION", 409, "Only draft recipes can enter review.");
    const document = normalizeAdminRecipeDocument(editable(await loadRecipe(client, recipeId)));
    const review = findings(document);
    if (review.errors.length) fail("RECIPE_REVIEW_BLOCKED", 422, "Recipe is not ready for review.", review);
    await client.query(`UPDATE recipes SET status='in_review',updated_at=now() WHERE id=$1::uuid`, [recipeId]);
    return { recipe: await loadRecipe(client, recipeId), findings: review };
  });
}

export async function publishAdminRecipe(identity: StaffIdentity, recipeId: string, changeNote?: string) {
  return transaction(identity, async (client) => {
    const state = await lockRecipe(client, recipeId);
    if (state.status !== "in_review") fail("INVALID_RECIPE_TRANSITION", 409, "Recipe must be in review before publishing.");
    const current = await loadRecipe(client, recipeId);
    const document = normalizeAdminRecipeDocument(editable(current));
    const review = findings(document);
    if (review.errors.length) fail("RECIPE_PUBLISH_BLOCKED", 422, "Recipe cannot be published.", review);
    const next = await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(version_number),0)::int+1 AS version FROM recipe_versions WHERE recipe_id=$1::uuid`,
      [recipeId],
    );
    const version = Number(next.rows[0]?.version || 1);
    await client.query(
      `INSERT INTO recipe_versions(recipe_id,version_number,snapshot,change_note,source,created_by_staff_id)
       VALUES($1::uuid,$2,$3::jsonb,$4,'human',$5::uuid)`,
      [recipeId, version, JSON.stringify({ schemaVersion: 1, document }), changeNote?.trim() || null, identity.staffId],
    );
    await client.query(
      `UPDATE recipes SET status='published',current_version=$2,approved_by_staff_id=$3::uuid,
       published_at=now(),archived_at=NULL,updated_at=now() WHERE id=$1::uuid`,
      [recipeId, version, identity.staffId],
    );
    return { recipe: await loadRecipe(client, recipeId), versionNumber: version, findings: review };
  });
}

export async function archiveAdminRecipe(identity: StaffIdentity, recipeId: string) {
  return transaction(identity, async (client) => {
    const state = await lockRecipe(client, recipeId);
    if (state.status === "archived") fail("INVALID_RECIPE_TRANSITION", 409, "Recipe is already archived.");
    await client.query(`UPDATE recipes SET status='archived',archived_at=now(),updated_at=now() WHERE id=$1::uuid`, [recipeId]);
    return { recipe: await loadRecipe(client, recipeId) };
  });
}

export async function restoreAdminRecipeVersion(identity: StaffIdentity, recipeId: string, version: number) {
  return transaction(identity, async (client) => {
    await lockRecipe(client, recipeId);
    const result = await client.query<{ snapshot: { document?: unknown } }>(
      `SELECT snapshot FROM recipe_versions WHERE recipe_id=$1::uuid AND version_number=$2`,
      [recipeId, version],
    );
    if (!result.rows[0]?.snapshot?.document) fail("RECIPE_VERSION_NOT_FOUND", 404, "Recipe version was not found.");
    const document = normalizeAdminRecipeDocument(result.rows[0].snapshot.document);
    document.visibility = "internal";
    await replaceDocument(client, recipeId, document);
    await client.query(
      `UPDATE recipes SET status='draft',visibility='internal',approved_by_staff_id=NULL,
       published_at=NULL,archived_at=NULL,updated_at=now() WHERE id=$1::uuid`,
      [recipeId],
    );
    return { recipe: await loadRecipe(client, recipeId), restoredFromVersion: version };
  });
}

function parseRecipeId(value: unknown) {
  return uuid(value, "recipeId") as string;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof AdminRecipeError) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  console.error("admin recipe request failed", error);
  res.status(500).json({ error: "ADMIN_RECIPE_REQUEST_FAILED" });
}

export function createAdminRecipeRouter(identityResolver: AdminRecipeIdentityResolver) {
  const router = Router();
  const admin = async (req: Request) => requireAdmin(await identityResolver(req));

  router.get("/", async (req, res) => {
    try {
      await admin(req);
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const values: unknown[] = [];
      const where: string[] = [];
      if (status) {
        if (!["draft", "in_review", "published", "archived"].includes(status)) fail("INVALID_RECIPE_STATUS", 400, "Invalid status.");
        values.push(status);
        where.push(`status=$${values.length}`);
      }
      const result = await getDb().query(
        `SELECT id::text,slug,title,status,visibility,current_version AS "currentVersion",updated_at AS "updatedAt"
         FROM recipes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC,id DESC LIMIT 100`,
        values,
      );
      res.json({ recipes: result.rows, total: result.rows.length });
    } catch (error) { sendError(res, error); }
  });

  router.post("/", async (req, res) => {
    try { res.status(201).json(await createAdminRecipe(await admin(req), req.body)); }
    catch (error) { sendError(res, error); }
  });
  router.get("/:recipeId", async (req, res) => {
    try { await admin(req); res.json({ recipe: await loadRecipe(getDb(), parseRecipeId(req.params.recipeId)) }); }
    catch (error) { sendError(res, error); }
  });
  router.patch("/:recipeId", async (req, res) => {
    try { res.json(await updateAdminRecipe(await admin(req), parseRecipeId(req.params.recipeId), req.body)); }
    catch (error) { sendError(res, error); }
  });
  router.post("/:recipeId/submit-review", async (req, res) => {
    try { res.json(await submitAdminRecipeReview(await admin(req), parseRecipeId(req.params.recipeId))); }
    catch (error) { sendError(res, error); }
  });
  router.post("/:recipeId/publish", async (req, res) => {
    try { res.json(await publishAdminRecipe(await admin(req), parseRecipeId(req.params.recipeId), req.body?.changeNote)); }
    catch (error) { sendError(res, error); }
  });
  router.post("/:recipeId/archive", async (req, res) => {
    try { res.json(await archiveAdminRecipe(await admin(req), parseRecipeId(req.params.recipeId))); }
    catch (error) { sendError(res, error); }
  });
  router.get("/:recipeId/versions", async (req, res) => {
    try {
      await admin(req);
      const recipeId = parseRecipeId(req.params.recipeId);
      await loadRecipe(getDb(), recipeId);
      const result = await getDb().query(
        `SELECT version_number AS "versionNumber",change_note AS "changeNote",source,created_at AS "createdAt"
         FROM recipe_versions WHERE recipe_id=$1::uuid ORDER BY version_number DESC`,
        [recipeId],
      );
      res.json({ versions: result.rows, total: result.rows.length });
    } catch (error) { sendError(res, error); }
  });
  router.post("/:recipeId/restore/:version", async (req, res) => {
    try {
      const version = Number(req.params.version);
      if (!Number.isInteger(version) || version < 1) fail("INVALID_RECIPE_VERSION", 400, "Version is invalid.");
      res.json(await restoreAdminRecipeVersion(await admin(req), parseRecipeId(req.params.recipeId), version));
    } catch (error) { sendError(res, error); }
  });

  return router;
}
