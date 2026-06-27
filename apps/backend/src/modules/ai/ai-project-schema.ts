import {
  AI_SCHEMA_VERSION,
  AI_USE_CASES,
  parseAiJsonSchema,
  type AiJsonObject,
  type AiJsonSchema,
  type AiUseCase,
} from "./ai-schema";

export const AI_PROJECT_SCHEMA_VERSION = "1.0" as const;

export type AiProjectModelDefinition = {
  key: string;
  provider: "vertex_ai";
  modelId: string;
  displayName: string;
  enabled: boolean;
  configuration: AiJsonObject;
};

export type AiProjectAgentDefinition = {
  key: string;
  name: string;
  description: string | null;
  useCase: AiUseCase;
  modelKey: string;
  systemInstruction: string | null;
  inputSchema: AiJsonSchema;
  outputSchema: AiJsonSchema;
  enabled: boolean;
  configuration: AiJsonObject;
};

export type AiProjectDefinition = {
  schemaVersion: typeof AI_PROJECT_SCHEMA_VERSION;
  project: {
    key: string;
    name: string;
    description: string | null;
  };
  models: AiProjectModelDefinition[];
  agents: AiProjectAgentDefinition[];
};

export class AiProjectSchemaError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const ALLOWED_USE_CASES = new Set<string>(AI_USE_CASES);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_MODELS = 50;
const MAX_AGENTS = 200;
const MAX_TEXT = 20_000;

function fail(code: string, path: string, message: string): never {
  throw new AiProjectSchemaError(code, path, message);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_OBJECT", path, `${path} must be an object.`);
  return value as Record<string, unknown>;
}

function onlyKeys(source: Record<string, unknown>, allowed: readonly string[], path: string) {
  const set = new Set(allowed);
  for (const key of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(key) || !set.has(key)) fail("UNKNOWN_FIELD", `${path}.${key}`, `Unknown field ${path}.${key}.`);
  }
}

function text(value: unknown, path: string, maxLength = 200) {
  if (typeof value !== "string") fail("INVALID_STRING", path, `${path} must be a string.`);
  const normalized = value.trim();
  if (!normalized) fail("EMPTY_STRING", path, `${path} must not be empty.`);
  if (normalized.length > maxLength) fail("STRING_TOO_LONG", path, `${path} is too long.`);
  return normalized;
}

function optionalText(value: unknown, path: string, maxLength = 1000) {
  if (value === undefined || value === null) return null;
  return text(value, path, maxLength);
}

function key(value: unknown, path: string) {
  const normalized = text(value, path, 64);
  if (!KEY_PATTERN.test(normalized)) fail("INVALID_KEY", path, `${path} is not a valid key.`);
  return normalized;
}

function jsonObject(value: unknown, path: string): AiJsonObject {
  if (value === undefined) return {};
  const source = object(value, path);
  for (const itemKey of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(itemKey)) fail("FORBIDDEN_KEY", `${path}.${itemKey}`, `Forbidden key ${itemKey}.`);
  }
  return source as AiJsonObject;
}

function booleanValue(value: unknown, path: string, fallback = true) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail("INVALID_BOOLEAN", path, `${path} must be boolean.`);
  return value;
}

export function parseAiProjectDefinition(raw: unknown): AiProjectDefinition {
  const source = object(raw, "projectJson");
  onlyKeys(source, ["schemaVersion", "project", "models", "agents"], "projectJson");
  if (source.schemaVersion !== AI_PROJECT_SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA_VERSION", "schemaVersion", `schemaVersion must be ${AI_PROJECT_SCHEMA_VERSION}.`);
  }

  const projectSource = object(source.project, "project");
  onlyKeys(projectSource, ["key", "name", "description"], "project");
  const project = {
    key: key(projectSource.key, "project.key"),
    name: text(projectSource.name, "project.name", 200),
    description: optionalText(projectSource.description, "project.description", 2000),
  };

  if (!Array.isArray(source.models) || source.models.length < 1 || source.models.length > MAX_MODELS) {
    fail("INVALID_MODEL_COUNT", "models", `models must contain from 1 to ${MAX_MODELS} items.`);
  }
  const modelKeys = new Set<string>();
  const models = source.models.map((item, index): AiProjectModelDefinition => {
    const path = `models[${index}]`;
    const model = object(item, path);
    onlyKeys(model, ["key", "provider", "modelId", "displayName", "enabled", "configuration"], path);
    const modelKey = key(model.key, `${path}.key`);
    if (modelKeys.has(modelKey)) fail("DUPLICATE_MODEL_KEY", `${path}.key`, "Duplicate model key.");
    modelKeys.add(modelKey);
    if (model.provider !== "vertex_ai") fail("INVALID_PROVIDER", `${path}.provider`, "Only vertex_ai provider is allowed.");
    const modelId = text(model.modelId, `${path}.modelId`, 200);
    if (!MODEL_ID_PATTERN.test(modelId)) fail("INVALID_MODEL_ID", `${path}.modelId`, "Invalid model ID.");
    return {
      key: modelKey,
      provider: "vertex_ai",
      modelId,
      displayName: text(model.displayName ?? modelKey, `${path}.displayName`, 200),
      enabled: booleanValue(model.enabled, `${path}.enabled`),
      configuration: jsonObject(model.configuration, `${path}.configuration`),
    };
  });

  if (!Array.isArray(source.agents) || source.agents.length < 1 || source.agents.length > MAX_AGENTS) {
    fail("INVALID_AGENT_COUNT", "agents", `agents must contain from 1 to ${MAX_AGENTS} items.`);
  }
  const agentKeys = new Set<string>();
  const agents = source.agents.map((item, index): AiProjectAgentDefinition => {
    const path = `agents[${index}]`;
    const agent = object(item, path);
    onlyKeys(agent, [
      "key",
      "name",
      "description",
      "useCase",
      "modelKey",
      "systemInstruction",
      "inputSchema",
      "outputSchema",
      "enabled",
      "configuration",
    ], path);
    const agentKey = key(agent.key, `${path}.key`);
    if (agentKeys.has(agentKey)) fail("DUPLICATE_AGENT_KEY", `${path}.key`, "Duplicate agent key.");
    agentKeys.add(agentKey);
    const modelKey = key(agent.modelKey, `${path}.modelKey`);
    if (!modelKeys.has(modelKey)) fail("UNKNOWN_MODEL_KEY", `${path}.modelKey`, "Agent references an unknown model.");
    if (typeof agent.useCase !== "string" || !ALLOWED_USE_CASES.has(agent.useCase)) {
      fail("INVALID_USE_CASE", `${path}.useCase`, "Agent useCase is not supported.");
    }
    const systemInstruction = optionalText(agent.systemInstruction, `${path}.systemInstruction`, MAX_TEXT);
    return {
      key: agentKey,
      name: text(agent.name, `${path}.name`, 200),
      description: optionalText(agent.description, `${path}.description`, 2000),
      useCase: agent.useCase as AiUseCase,
      modelKey,
      systemInstruction,
      inputSchema: parseAiJsonSchema(agent.inputSchema ?? { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, `${path}.inputSchema`),
      outputSchema: parseAiJsonSchema(agent.outputSchema ?? { type: "object", properties: { result: { type: "string" } }, required: ["result"] }, `${path}.outputSchema`),
      enabled: booleanValue(agent.enabled, `${path}.enabled`),
      configuration: jsonObject(agent.configuration, `${path}.configuration`),
    };
  });

  return { schemaVersion: AI_SCHEMA_VERSION, project, models, agents };
}
