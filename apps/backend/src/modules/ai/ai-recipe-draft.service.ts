import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";
import { AiProjectStoreError } from "./ai-project-store.service";

type RecipeIngredientInput = {
  name: string;
  quantity: string | null;
  unit: string | null;
  note: string | null;
  optional: boolean;
};

type RecipeStepInput = {
  title: string | null;
  content: string;
  imageUrl: string | null;
};

type RecipeDraftPayload = {
  title: string;
  slug: string | null;
  shortDescription: string | null;
  description: string | null;
  relatedBrand: string | null;
  coverImageUrl: string | null;
  estimatedCost: string | null;
  suggestedPrice: string | null;
  ingredients: RecipeIngredientInput[];
  steps: RecipeStepInput[];
};

type AiDocumentRecipeRow = {
  id: string;
  source: string;
  status: string;
  apply_status: string;
  validation_status: string;
  json_payload: unknown;
  agent_id: string | null;
  model_id: string | null;
  agent_use_case: string | null;
};

const MAX_TITLE_LENGTH = 180;
const MAX_TEXT_LENGTH = 5000;
const MAX_SHORT_TEXT_LENGTH = 500;
const MAX_INGREDIENTS = 80;
const MAX_STEPS = 80;
const DECIMAL = /^\d+(?:\.\d{1,4})?$/;

function requireAdmin(identity: RequestIdentity): StaffIdentity {
  if (identity.kind === "anonymous") throw new AiProjectStoreError("AUTH_REQUIRED", 401, "Authentication is required.");
  if (identity.kind !== "staff" || identity.role !== "admin") {
    throw new AiProjectStoreError("ADMIN_ACCESS_REQUIRED", 403, "Administrator access is required.");
  }
  if (!identity.isActive) throw new AiProjectStoreError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  return identity;
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, { required = false, max = MAX_TEXT_LENGTH } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, `${field} is required.`);
    return null;
  }
  if (typeof value !== "string") {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, `${field} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    if (required) throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, `${field} is required.`);
    return null;
  }
  if (normalized.length > max) {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, `${field} is too long.`);
  }
  return normalized;
}

function decimalText(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "number" ? String(value) : text(value, field, { required: true, max: 40 });
  if (!normalized || !DECIMAL.test(normalized) || Number(normalized) < 0) {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, `${field} must be a non-negative decimal.`);
  }
  return normalized;
}

function booleanValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, "ingredient optional must be boolean.");
  }
  return value;
}

function readField(source: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(source, name)) return source[name];
  }
  return undefined;
}

function parseIngredients(value: unknown): RecipeIngredientInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, "ingredients must be a non-empty array.");
  }
  if (value.length > MAX_INGREDIENTS) {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, "ingredients has too many items.");
  }
  return value.map((item, index) => {
    const source = objectValue(item, `ingredients[${index}]`);
    return {
      name: text(readField(source, "name", "productName", "product_name"), `ingredients[${index}].name`, {
        required: true,
        max: 240,
      })!,
      quantity: decimalText(readField(source, "quantity", "usageQuantity", "usage_quantity"), `ingredients[${index}].quantity`),
      unit: text(readField(source, "unit", "usageUnit", "usage_unit"), `ingredients[${index}].unit`, { max: 40 }),
      note: text(source.note, `ingredients[${index}].note`, { max: 1000 }),
      optional: booleanValue(readField(source, "optional", "isOptional", "is_optional")),
    };
  });
}

function parseSteps(value: unknown): RecipeStepInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, "steps must be a non-empty array.");
  }
  if (value.length > MAX_STEPS) {
    throw new AiProjectStoreError("INVALID_RECIPE_DRAFT_PAYLOAD", 400, "steps has too many items.");
  }
  return value.map((item, index) => {
    const source = objectValue(item, `steps[${index}]`);
    return {
      title: text(source.title, `steps[${index}].title`, { max: 240 }),
      content: text(readField(source, "content", "instruction"), `steps[${index}].content`, {
        required: true,
        max: MAX_TEXT_LENGTH,
      })!,
      imageUrl: text(readField(source, "imageUrl", "image_url", "mediaUrl", "media_url"), `steps[${index}].imageUrl`, {
        max: 1000,
      }),
    };
  });
}

function parsePayload(value: unknown): RecipeDraftPayload {
  const source = objectValue(value, "jsonPayload");
  return {
    title: text(source.title, "title", { required: true, max: MAX_TITLE_LENGTH })!,
    slug: text(source.slug, "slug", { max: 180 }),
    shortDescription: text(readField(source, "shortDescription", "short_description"), "shortDescription", {
      max: MAX_SHORT_TEXT_LENGTH,
    }),
    description: text(source.description, "description", { max: MAX_TEXT_LENGTH }),
    relatedBrand: text(readField(source, "relatedBrand", "related_brand"), "relatedBrand", { max: 180 }),
    coverImageUrl: text(readField(source, "coverImageUrl", "cover_image_url"), "coverImageUrl", { max: 1000 }),
    estimatedCost: decimalText(readField(source, "estimatedCost", "estimated_cost"), "estimatedCost"),
    suggestedPrice: decimalText(readField(source, "suggestedPrice", "suggested_price"), "suggestedPrice"),
    ingredients: parseIngredients(source.ingredients),
    steps: parseSteps(source.steps),
  };
}

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || "ai-recipe";
}

async function uniqueSlug(db: Pool, requested: string | null, title: string) {
  const base = slugify(requested || title);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const result = await db.query("SELECT 1 FROM recipes WHERE slug=$1 LIMIT 1", [candidate]);
    if (result.rowCount === 0) return candidate;
  }
  throw new AiProjectStoreError("RECIPE_SLUG_UNAVAILABLE", 409, "Could not create a unique recipe slug.");
}

export class AiRecipeDraftService {
  constructor(private readonly db: Pool = getDb()) {}

  async createRecipeDraft(identity: RequestIdentity, documentId: string) {
    const admin = requireAdmin(identity);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const documentResult = await client.query<AiDocumentRecipeRow>(
        `SELECT d.id,d.source,d.status,d.apply_status,d.validation_status,d.json_payload,
                d.agent_id,d.model_id,a.use_case AS agent_use_case
         FROM ai_documents d
         LEFT JOIN ai_project_agents a ON a.id=d.agent_id
         WHERE d.id=$1
         FOR UPDATE OF d`,
        [documentId],
      );
      if (documentResult.rowCount === 0) {
        throw new AiProjectStoreError("AI_DRAFT_NOT_FOUND", 404, "AI draft was not found.");
      }
      const document = documentResult.rows[0];
      if (document.source !== "ai") throw new AiProjectStoreError("AI_DRAFT_REQUIRED", 409, "Only AI documents can create recipe drafts.");
      if (document.status !== "approved") {
        throw new AiProjectStoreError("AI_DRAFT_NOT_APPROVED", 409, "Only approved AI drafts can create recipe drafts.");
      }
      if (document.apply_status !== "pending_apply") {
        throw new AiProjectStoreError("AI_DRAFT_NOT_READY", 409, "AI draft is not pending recipe draft creation.");
      }
      if (document.validation_status !== "valid") {
        throw new AiProjectStoreError("AI_DRAFT_INVALID", 409, "Only valid AI drafts can create recipe drafts.");
      }
      if (document.agent_use_case !== "recipe_draft") {
        throw new AiProjectStoreError("AI_DRAFT_USE_CASE_MISMATCH", 409, "AI draft use case must be recipe_draft.");
      }
      const existingLink = await client.query("SELECT recipe_id FROM ai_recipe_draft_links WHERE document_id=$1", [documentId]);
      if (existingLink.rowCount > 0) {
        throw new AiProjectStoreError("AI_DRAFT_ALREADY_LINKED", 409, "AI draft already created a recipe draft.");
      }

      const payload = parsePayload(document.json_payload);
      const slug = await uniqueSlug(client as unknown as Pool, payload.slug, payload.title);
      const recipeResult = await client.query(
        `INSERT INTO recipes (
           slug,title,short_description,description,related_brand,cover_image_url,
           estimated_cost,suggested_price,source_confidence,status,sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'needs_review','draft',0)
         RETURNING id,slug,title,status,created_at,updated_at`,
        [
          slug,
          payload.title,
          payload.shortDescription,
          payload.description,
          payload.relatedBrand,
          payload.coverImageUrl,
          payload.estimatedCost,
          payload.suggestedPrice,
        ],
      );
      const recipe = recipeResult.rows[0];

      for (const [index, ingredient] of payload.ingredients.entries()) {
        await client.query(
          `INSERT INTO recipe_ingredients (recipe_id,product_name,name,quantity,unit,note,optional,sort_order)
           VALUES ($1,$2,$2,$3,$4,$5,$6,$7)`,
          [
            recipe.id,
            ingredient.name,
            ingredient.quantity,
            ingredient.unit,
            ingredient.note,
            ingredient.optional,
            index + 1,
          ],
        );
      }

      for (const [index, step] of payload.steps.entries()) {
        await client.query(
          `INSERT INTO recipe_steps (recipe_id,step_no,title,content,image_url)
           VALUES ($1,$2,$3,$4,$5)`,
          [recipe.id, index + 1, step.title, step.content, step.imageUrl],
        );
      }

      await client.query(
        `INSERT INTO ai_recipe_draft_links (
           document_id,recipe_id,actor_staff_id,agent_id,model_id,source_payload
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [documentId, recipe.id, admin.staffId, document.agent_id, document.model_id, JSON.stringify(document.json_payload)],
      );

      const updatedDocument = await client.query(
        `UPDATE ai_documents
         SET apply_status='applied', applied_at=now(), updated_by_staff_id=$2, updated_at=now(), version=version+1
         WHERE id=$1
         RETURNING id,status,apply_status,applied_at,version,updated_at`,
        [documentId, admin.staffId],
      );

      await client.query("COMMIT");
      return {
        recipe: {
          id: recipe.id as string,
          slug: recipe.slug as string,
          title: recipe.title as string,
          status: recipe.status as string,
          createdAt: recipe.created_at as string,
          updatedAt: recipe.updated_at as string,
        },
        document: {
          id: updatedDocument.rows[0].id as string,
          status: updatedDocument.rows[0].status as string,
          applyStatus: updatedDocument.rows[0].apply_status as string,
          appliedAt: updatedDocument.rows[0].applied_at as string,
          version: Number(updatedDocument.rows[0].version),
          updatedAt: updatedDocument.rows[0].updated_at as string,
        },
        counts: {
          ingredients: payload.ingredients.length,
          steps: payload.steps.length,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
