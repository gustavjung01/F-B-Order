import type { RecipeListFilters } from "./recipe.types";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;
const MAX_QUERY_LENGTH = 120;
const MAX_SLUG_LENGTH = 180;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RecipeValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RecipeValidationError";
    this.code = code;
  }
}

function readSingleText(value: unknown, field: string, maxLength: number): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new RecipeValidationError("INVALID_RECIPE_QUERY", `${field} must be a string.`);
  }
  const normalized = raw.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new RecipeValidationError("INVALID_RECIPE_QUERY", `${field} is too long.`);
  }
  return normalized;
}

function readInteger(value: unknown, fallback: number, min: number, max: number, field: string): number {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RecipeValidationError("INVALID_RECIPE_QUERY", `${field} is out of range.`);
  }
  return parsed;
}

function readOptionalSlug(value: unknown, field: string): string | null {
  const slug = readSingleText(value, field, MAX_SLUG_LENGTH);
  if (slug && !SLUG_PATTERN.test(slug)) {
    throw new RecipeValidationError("INVALID_RECIPE_QUERY", `${field} is not a valid slug.`);
  }
  return slug;
}

export function parseRecipeListFilters(query: Record<string, unknown>): RecipeListFilters {
  return {
    query: readSingleText(query.q, "q", MAX_QUERY_LENGTH),
    category: readOptionalSlug(query.category, "category"),
    tag: readOptionalSlug(query.tag, "tag"),
    limit: readInteger(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, "limit"),
    offset: readInteger(query.offset, 0, 0, MAX_OFFSET, "offset"),
  };
}

export function parseRecipeSlug(value: unknown): string {
  if (typeof value !== "string") {
    throw new RecipeValidationError("INVALID_RECIPE_SLUG", "Recipe slug is required.");
  }
  const slug = value.trim();
  if (!slug || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    throw new RecipeValidationError("INVALID_RECIPE_SLUG", "Recipe slug is invalid.");
  }
  return slug;
}

export function parseRecipeId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new RecipeValidationError("INVALID_RECIPE_ID", "Recipe id must be a UUID.");
  }
  return value.trim().toLowerCase();
}

export function parseRelatedLimit(value: unknown): number {
  return readInteger(value, 6, 1, 12, "limit");
}
