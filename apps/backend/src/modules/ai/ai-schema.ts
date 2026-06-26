export const AI_SCHEMA_VERSION = "1.0" as const;

export const AI_USE_CASES = [
  "recipe_draft",
  "catalog_enrichment",
  "customer_support_draft",
  "operations_assistant",
] as const;

export const AI_RESPONSE_FORMATS = ["text", "json"] as const;

export type AiUseCase = (typeof AI_USE_CASES)[number];
export type AiResponseFormat = (typeof AI_RESPONSE_FORMATS)[number];
export type AiJsonPrimitive = string | number | boolean | null;
export type AiJsonValue = AiJsonPrimitive | AiJsonValue[] | { [key: string]: AiJsonValue };
export type AiJsonObject = { [key: string]: AiJsonValue };
export type AiJsonSchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean";

export type AiJsonSchema = {
  type: AiJsonSchemaType;
  description?: string;
  enum?: AiJsonPrimitive[];
  properties?: Record<string, AiJsonSchema>;
  required?: string[];
  items?: AiJsonSchema;
  additionalProperties?: false;
};

export type AiGatewayRequest = {
  schemaVersion: typeof AI_SCHEMA_VERSION;
  useCase: AiUseCase;
  input: {
    text: string;
    context?: AiJsonObject;
  };
  response:
    | { format: "text" }
    | { format: "json"; schema: AiJsonSchema };
  controls: {
    temperature: number;
    maxOutputTokens: number;
  };
  metadata?: {
    correlationId?: string;
    idempotencyKey?: string;
  };
};

export type AiGatewayUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AiGatewaySuccessResponse = {
  schemaVersion: typeof AI_SCHEMA_VERSION;
  requestId: string;
  useCase: AiUseCase;
  provider: "vertex_ai" | "mock";
  model: string;
  output:
    | { format: "text"; text: string }
    | { format: "json"; value: AiJsonValue };
  usage: AiGatewayUsage;
  finishReason: string | null;
  latencyMs: number;
};

export type AiGatewayErrorResponse = {
  schemaVersion: typeof AI_SCHEMA_VERSION;
  requestId?: string;
  error: string;
  message: string;
  details?: unknown;
};

const MAX_INPUT_TEXT_LENGTH = 20_000;
const MAX_CONTEXT_JSON_LENGTH = 20_000;
const MAX_OUTPUT_TOKENS = 8_192;
const MAX_SCHEMA_DEPTH = 6;
const MAX_SCHEMA_PROPERTIES = 64;
const MAX_ENUM_VALUES = 100;
const PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ALLOWED_USE_CASES = new Set<string>(AI_USE_CASES);
const JSON_SCHEMA_TYPES = new Set<AiJsonSchemaType>([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export class AiSchemaError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: string, path: string, message: string): never {
  throw new AiSchemaError(code, path, message);
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_OBJECT", path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(source: Record<string, unknown>, allowed: readonly string[], path: string) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(key) || !allowedSet.has(key)) {
      fail("UNKNOWN_FIELD", `${path}.${key}`, `Unknown field ${path}.${key}.`);
    }
  }
}

function readOptionalText(value: unknown, path: string, maxLength: number) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail("INVALID_STRING", path, `${path} must be a string.`);
  const normalized = value.trim();
  if (!normalized) fail("EMPTY_STRING", path, `${path} must not be empty.`);
  if (normalized.length > maxLength) fail("STRING_TOO_LONG", path, `${path} is too long.`);
  return normalized;
}

function normalizeJsonValue(value: unknown, path: string, depth = 0): AiJsonValue {
  if (depth > MAX_SCHEMA_DEPTH + 2) {
    fail("JSON_TOO_DEEP", path, `${path} exceeds the maximum nesting depth.`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("INVALID_NUMBER", path, `${path} must be a finite number.`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeJsonValue(item, `${path}[${index}]`, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: AiJsonObject = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) fail("FORBIDDEN_KEY", `${path}.${key}`, `Forbidden key ${key}.`);
      result[key] = normalizeJsonValue(item, `${path}.${key}`, depth + 1);
    }
    return result;
  }
  fail("INVALID_JSON_VALUE", path, `${path} must be valid JSON data.`);
}

function enumValueMatchesType(value: AiJsonPrimitive, type: AiJsonSchemaType) {
  if (value === null) return false;
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return false;
}

function parseSchemaEnum(value: unknown, type: AiJsonSchemaType, path: string) {
  if (value === undefined) return undefined;
  if (!["string", "number", "integer", "boolean"].includes(type)) {
    fail("ENUM_NOT_SUPPORTED", path, `${path} is only supported for primitive schemas.`);
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ENUM_VALUES) {
    fail("INVALID_ENUM", path, `${path} must contain from 1 to ${MAX_ENUM_VALUES} values.`);
  }
  const normalized = value.map((item, index) => {
    const candidate = normalizeJsonValue(item, `${path}[${index}]`);
    if (candidate !== null && typeof candidate === "object") {
      fail("INVALID_ENUM_VALUE", `${path}[${index}]`, "Enum values must be primitive.");
    }
    if (!enumValueMatchesType(candidate as AiJsonPrimitive, type)) {
      fail("ENUM_TYPE_MISMATCH", `${path}[${index}]`, "Enum value does not match schema type.");
    }
    return candidate as AiJsonPrimitive;
  });
  if (new Set(normalized.map((item) => JSON.stringify(item))).size !== normalized.length) {
    fail("DUPLICATE_ENUM_VALUE", path, `${path} contains duplicate values.`);
  }
  return normalized;
}

export function parseAiJsonSchema(value: unknown, path = "response.schema", depth = 0): AiJsonSchema {
  if (depth > MAX_SCHEMA_DEPTH) {
    fail("SCHEMA_TOO_DEEP", path, `${path} exceeds maximum schema depth ${MAX_SCHEMA_DEPTH}.`);
  }
  const source = asObject(value, path);
  assertOnlyKeys(
    source,
    ["type", "description", "enum", "properties", "required", "items", "additionalProperties"],
    path,
  );

  const type = source.type;
  if (typeof type !== "string" || !JSON_SCHEMA_TYPES.has(type as AiJsonSchemaType)) {
    fail("INVALID_SCHEMA_TYPE", `${path}.type`, `${path}.type is not supported.`);
  }
  const normalizedType = type as AiJsonSchemaType;
  const description = readOptionalText(source.description, `${path}.description`, 500);
  const enumValues = parseSchemaEnum(source.enum, normalizedType, `${path}.enum`);
  const result: AiJsonSchema = { type: normalizedType };
  if (description) result.description = description;
  if (enumValues) result.enum = enumValues;

  if (normalizedType === "object") {
    const rawProperties = asObject(source.properties, `${path}.properties`);
    const entries = Object.entries(rawProperties);
    if (entries.length === 0 || entries.length > MAX_SCHEMA_PROPERTIES) {
      fail(
        "INVALID_PROPERTY_COUNT",
        `${path}.properties`,
        `${path}.properties must contain from 1 to ${MAX_SCHEMA_PROPERTIES} fields.`,
      );
    }
    const properties: Record<string, AiJsonSchema> = {};
    for (const [key, child] of entries) {
      if (!PROPERTY_KEY.test(key) || FORBIDDEN_KEYS.has(key)) {
        fail("INVALID_PROPERTY_NAME", `${path}.properties.${key}`, `Invalid schema property name ${key}.`);
      }
      properties[key] = parseAiJsonSchema(child, `${path}.properties.${key}`, depth + 1);
    }
    result.properties = properties;

    if (source.required !== undefined) {
      if (!Array.isArray(source.required)) {
        fail("INVALID_REQUIRED", `${path}.required`, `${path}.required must be an array.`);
      }
      const required = source.required.map((item, index) => {
        if (typeof item !== "string" || !Object.hasOwn(properties, item)) {
          fail("UNKNOWN_REQUIRED_PROPERTY", `${path}.required[${index}]`, "Required property is not defined.");
        }
        return item;
      });
      if (new Set(required).size !== required.length) {
        fail("DUPLICATE_REQUIRED_PROPERTY", `${path}.required`, `${path}.required contains duplicates.`);
      }
      result.required = required;
    }

    if (source.additionalProperties !== undefined && source.additionalProperties !== false) {
      fail(
        "ADDITIONAL_PROPERTIES_NOT_ALLOWED",
        `${path}.additionalProperties`,
        "additionalProperties must be false when provided.",
      );
    }
    result.additionalProperties = false;
  } else if (normalizedType === "array") {
    if (source.items === undefined) fail("ITEMS_REQUIRED", `${path}.items`, `${path}.items is required.`);
    result.items = parseAiJsonSchema(source.items, `${path}.items`, depth + 1);
    for (const key of ["properties", "required", "additionalProperties"] as const) {
      if (source[key] !== undefined) fail("FIELD_NOT_ALLOWED", `${path}.${key}`, `${path}.${key} is not allowed.`);
    }
  } else {
    for (const key of ["properties", "required", "items", "additionalProperties"] as const) {
      if (source[key] !== undefined) fail("FIELD_NOT_ALLOWED", `${path}.${key}`, `${path}.${key} is not allowed.`);
    }
  }

  return result;
}

function parseResponse(value: unknown): AiGatewayRequest["response"] {
  const source = asObject(value, "response");
  const format = source.format;
  if (format === "text") {
    assertOnlyKeys(source, ["format"], "response");
    return { format: "text" };
  }
  if (format === "json") {
    assertOnlyKeys(source, ["format", "schema"], "response");
    return { format: "json", schema: parseAiJsonSchema(source.schema) };
  }
  fail("INVALID_RESPONSE_FORMAT", "response.format", "response.format must be text or json.");
}

function parseControls(value: unknown): AiGatewayRequest["controls"] {
  if (value === undefined) return { temperature: 0.2, maxOutputTokens: 1024 };
  const source = asObject(value, "controls");
  assertOnlyKeys(source, ["temperature", "maxOutputTokens"], "controls");

  const temperature = source.temperature === undefined ? 0.2 : Number(source.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
    fail("INVALID_TEMPERATURE", "controls.temperature", "temperature must be between 0 and 1.");
  }

  const maxOutputTokens = source.maxOutputTokens === undefined ? 1024 : Number(source.maxOutputTokens);
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_OUTPUT_TOKENS) {
    fail(
      "INVALID_MAX_OUTPUT_TOKENS",
      "controls.maxOutputTokens",
      `maxOutputTokens must be an integer from 1 to ${MAX_OUTPUT_TOKENS}.`,
    );
  }

  return { temperature, maxOutputTokens };
}

function parseMetadata(value: unknown): AiGatewayRequest["metadata"] {
  if (value === undefined) return undefined;
  const source = asObject(value, "metadata");
  assertOnlyKeys(source, ["correlationId", "idempotencyKey"], "metadata");
  const correlationId = readOptionalText(source.correlationId, "metadata.correlationId", 128);
  const idempotencyKey = readOptionalText(source.idempotencyKey, "metadata.idempotencyKey", 128);
  if (!correlationId && !idempotencyKey) return undefined;
  return { ...(correlationId ? { correlationId } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) };
}

export function parseAiGatewayRequest(value: unknown): AiGatewayRequest {
  const source = asObject(value, "request");
  assertOnlyKeys(source, ["schemaVersion", "useCase", "input", "response", "controls", "metadata"], "request");

  if (source.schemaVersion !== AI_SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA_VERSION", "schemaVersion", `schemaVersion must be ${AI_SCHEMA_VERSION}.`);
  }
  if (typeof source.useCase !== "string" || !ALLOWED_USE_CASES.has(source.useCase)) {
    fail("INVALID_USE_CASE", "useCase", "useCase is not supported.");
  }

  const input = asObject(source.input, "input");
  assertOnlyKeys(input, ["text", "context"], "input");
  if (typeof input.text !== "string") fail("INVALID_STRING", "input.text", "input.text must be a string.");
  const text = input.text.trim();
  if (!text) fail("EMPTY_INPUT", "input.text", "input.text must not be empty.");
  if (text.length > MAX_INPUT_TEXT_LENGTH) {
    fail("INPUT_TOO_LONG", "input.text", `input.text exceeds ${MAX_INPUT_TEXT_LENGTH} characters.`);
  }

  let context: AiJsonObject | undefined;
  if (input.context !== undefined) {
    const normalized = normalizeJsonValue(input.context, "input.context");
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      fail("INVALID_CONTEXT", "input.context", "input.context must be a JSON object.");
    }
    context = normalized as AiJsonObject;
    if (JSON.stringify(context).length > MAX_CONTEXT_JSON_LENGTH) {
      fail("CONTEXT_TOO_LARGE", "input.context", `input.context exceeds ${MAX_CONTEXT_JSON_LENGTH} characters.`);
    }
  }

  return {
    schemaVersion: AI_SCHEMA_VERSION,
    useCase: source.useCase as AiUseCase,
    input: { text, ...(context ? { context } : {}) },
    response: parseResponse(source.response),
    controls: parseControls(source.controls),
    ...(parseMetadata(source.metadata) ? { metadata: parseMetadata(source.metadata) } : {}),
  };
}
