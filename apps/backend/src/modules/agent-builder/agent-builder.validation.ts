import { OrderEngineError } from "../orders/order-errors";
import type { AgentAudience, CreateAgentInput, CreateAgentVersionInput, JsonObject } from "./agent-builder.types";

const AGENT_KEY_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const RESOURCE_KEY_PATTERN = /^[a-z][a-z0-9._-]{2,95}$/;
const AUDIENCES: readonly AgentAudience[] = ["admin", "customer", "internal"];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertJsonSerializable(value: unknown, fieldName: string): void {
  try {
    JSON.stringify(value);
  } catch {
    throw new OrderEngineError("INVALID_JSON_CONFIG", 400, `${fieldName} must be JSON serializable.`);
  }
}

function normalizeText(value: unknown, fieldName: string, options: { required?: boolean; max: number }): string | null {
  if (value === undefined || value === null) {
    if (options.required) {
      throw new OrderEngineError("MISSING_REQUIRED_FIELD", 400, `${fieldName} is required.`);
    }
    return null;
  }

  if (typeof value !== "string") {
    throw new OrderEngineError("INVALID_FIELD_TYPE", 400, `${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  if (options.required && normalized.length === 0) {
    throw new OrderEngineError("MISSING_REQUIRED_FIELD", 400, `${fieldName} is required.`);
  }
  if (normalized.length > options.max) {
    throw new OrderEngineError("FIELD_TOO_LONG", 400, `${fieldName} cannot exceed ${options.max} characters.`);
  }
  return normalized || null;
}

export function normalizeAgentKey(value: unknown): string {
  const normalized = normalizeText(value, "agentKey", { required: true, max: 64 });
  if (!normalized || !AGENT_KEY_PATTERN.test(normalized)) {
    throw new OrderEngineError(
      "INVALID_AGENT_KEY",
      400,
      "agentKey must use lowercase letters, numbers and hyphens, start with a letter, and be 3-64 characters.",
    );
  }
  return normalized;
}

export function normalizeResourceKey(value: unknown, fieldName: string): string {
  const normalized = normalizeText(value, fieldName, { required: true, max: 96 });
  if (!normalized || !RESOURCE_KEY_PATTERN.test(normalized)) {
    throw new OrderEngineError(
      "INVALID_RESOURCE_KEY",
      400,
      `${fieldName} must use lowercase letters, numbers, dots, underscores or hyphens, start with a letter, and be 3-96 characters.`,
    );
  }
  return normalized;
}

function normalizeResourceKeys(value: unknown, fieldName: string, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new OrderEngineError("INVALID_FIELD_TYPE", 400, `${fieldName} must be an array.`);
  }
  if (value.length > maxItems) {
    throw new OrderEngineError("TOO_MANY_RESOURCES", 400, `${fieldName} cannot contain more than ${maxItems} items.`);
  }

  const keys = value.map((item) => normalizeResourceKey(item, fieldName));
  if (new Set(keys).size !== keys.length) {
    throw new OrderEngineError("DUPLICATE_RESOURCE_KEY", 400, `${fieldName} cannot contain duplicate values.`);
  }
  return keys;
}

function normalizeBoundedInteger(
  value: unknown,
  fieldName: string,
  options: { fallback: number; min: number; max: number },
): number {
  if (value === undefined || value === null || value === "") return options.fallback;
  const candidate = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(candidate) || candidate < options.min || candidate > options.max) {
    throw new OrderEngineError(
      "INVALID_INTEGER",
      400,
      `${fieldName} must be an integer between ${options.min} and ${options.max}.`,
    );
  }
  return candidate;
}

export function normalizeVersionNumber(value: unknown): number {
  return normalizeBoundedInteger(value, "version", { fallback: -1, min: 1, max: 10_000 });
}

export function parseCreateAgentInput(value: unknown): CreateAgentInput {
  if (!isJsonObject(value)) {
    throw new OrderEngineError("INVALID_REQUEST_BODY", 400, "Request body must be a JSON object.");
  }

  const audience = value.audience;
  if (typeof audience !== "string" || !AUDIENCES.includes(audience as AgentAudience)) {
    throw new OrderEngineError("INVALID_AGENT_AUDIENCE", 400, "audience must be admin, customer or internal.");
  }

  return {
    agentKey: normalizeAgentKey(value.agentKey),
    name: normalizeText(value.name, "name", { required: true, max: 120 })!,
    description: normalizeText(value.description, "description", { max: 2_000 }),
    audience: audience as AgentAudience,
  };
}

export function parseCreateAgentVersionInput(value: unknown): CreateAgentVersionInput {
  if (!isJsonObject(value)) {
    throw new OrderEngineError("INVALID_REQUEST_BODY", 400, "Request body must be a JSON object.");
  }
  if (!isJsonObject(value.outputContract)) {
    throw new OrderEngineError("INVALID_OUTPUT_CONTRACT", 400, "outputContract must be a JSON object.");
  }
  assertJsonSerializable(value.outputContract, "outputContract");

  return {
    modelProfileKey: normalizeResourceKey(value.modelProfileKey, "modelProfileKey"),
    personaKey: normalizeResourceKey(value.personaKey, "personaKey"),
    policyProfileKey: normalizeResourceKey(value.policyProfileKey, "policyProfileKey"),
    systemInstructions: normalizeText(value.systemInstructions, "systemInstructions", {
      required: true,
      max: 24_000,
    })!,
    greeting: normalizeText(value.greeting, "greeting", { max: 1_000 }),
    outputContract: value.outputContract,
    maxToolCalls: normalizeBoundedInteger(value.maxToolCalls, "maxToolCalls", {
      fallback: 6,
      min: 0,
      max: 20,
    }),
    maxContextItems: normalizeBoundedInteger(value.maxContextItems, "maxContextItems", {
      fallback: 12,
      min: 0,
      max: 100,
    }),
    toolKeys: normalizeResourceKeys(value.toolKeys, "toolKeys", 30),
    knowledgeSourceKeys: normalizeResourceKeys(value.knowledgeSourceKeys, "knowledgeSourceKeys", 30),
  };
}
