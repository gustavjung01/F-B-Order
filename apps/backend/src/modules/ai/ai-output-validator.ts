import { AiSchemaError, type AiJsonPrimitive, type AiJsonSchema, type AiJsonValue } from "./ai-schema";

function mismatch(path: string, message: string): never {
  throw new AiSchemaError("MODEL_OUTPUT_SCHEMA_MISMATCH", path, message);
}

function isEnumValue(value: AiJsonValue, values: AiJsonPrimitive[]) {
  return values.some((candidate) => Object.is(candidate, value));
}

export function validateAiOutput(value: unknown, schema: AiJsonSchema, path = "output"): AiJsonValue {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      mismatch(path, `${path} must be an object.`);
    }
    const source = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(source, key)) mismatch(`${path}.${key}`, `${path}.${key} is required.`);
    }
    for (const key of Object.keys(source)) {
      if (!Object.hasOwn(properties, key)) mismatch(`${path}.${key}`, `${path}.${key} is unexpected.`);
    }
    const result: Record<string, AiJsonValue> = {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(source, key)) result[key] = validateAiOutput(source[key], childSchema, `${path}.${key}`);
    }
    return result;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) mismatch(path, `${path} must be an array.`);
    if (!schema.items) mismatch(path, `${path} schema is missing items.`);
    return value.map((item, index) => validateAiOutput(item, schema.items as AiJsonSchema, `${path}[${index}]`));
  }

  if (schema.type === "string" && typeof value !== "string") mismatch(path, `${path} must be a string.`);
  if (schema.type === "boolean" && typeof value !== "boolean") mismatch(path, `${path} must be a boolean.`);
  if (schema.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
    mismatch(path, `${path} must be an integer.`);
  }
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    mismatch(path, `${path} must be a finite number.`);
  }
  if (schema.enum && !isEnumValue(value as AiJsonValue, schema.enum)) {
    mismatch(path, `${path} is outside the allowed enum values.`);
  }
  return value as AiJsonValue;
}
