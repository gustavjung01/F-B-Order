import { GoogleAuth } from "google-auth-library";
import { OrderEngineError } from "../orders/order-errors.js";

type GoogleAgentResult = {
  provider: "google-agent-platform" | "deterministic";
  model: string | null;
  text: string;
  data: Record<string, unknown>;
  usage: Record<string, unknown>;
};

type GoogleAgentConfig = {
  project: string;
  location: string;
  engineId: string;
  endpoint: string;
  serviceAccountJsonBase64?: string;
};

function configFromEnv(): GoogleAgentConfig | null {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim();
  const engineId = process.env.GOOGLE_AGENT_ENGINE_ID?.trim();
  if (!project || !location || !engineId) return null;

  return {
    project,
    location,
    engineId,
    endpoint:
      process.env.GOOGLE_AGENT_ENDPOINT?.trim() ||
      `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/reasoningEngines/${engineId}:streamQuery`,
    serviceAccountJsonBase64: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim(),
  };
}

function missingConfigKeys(): string[] {
  return [
    ["GOOGLE_CLOUD_PROJECT", process.env.GOOGLE_CLOUD_PROJECT],
    ["GOOGLE_CLOUD_LOCATION", process.env.GOOGLE_CLOUD_LOCATION],
    ["GOOGLE_AGENT_ENGINE_ID", process.env.GOOGLE_AGENT_ENGINE_ID],
  ].flatMap(([key, value]) => String(value || "").trim() ? [] : [key]);
}

function deterministicFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.AI_ALLOW_DETERMINISTIC_FALLBACK?.trim().toLowerCase() === "true";
}

function providerNotConfiguredError(): OrderEngineError {
  return new OrderEngineError(
    "AI_PROVIDER_NOT_CONFIGURED",
    503,
    "Google Agent Platform is not fully configured. AI jobs cannot run until the worker environment is fixed.",
    { missingEnvironmentVariables: missingConfigKeys() },
  );
}

function createAuth(config: GoogleAgentConfig): GoogleAuth {
  if (!config.serviceAccountJsonBase64) {
    return new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(
      Buffer.from(config.serviceAccountJsonBase64, "base64").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    throw new OrderEngineError(
      "AI_GOOGLE_CREDENTIALS_INVALID",
      500,
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64 JSON",
    );
  }

  return new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
}

async function getGoogleAccessToken(config: GoogleAgentConfig): Promise<string> {
  const auth = createAuth(config);
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token = typeof accessToken === "string" ? accessToken : accessToken.token;
  if (!token) {
    throw new OrderEngineError(
      "AI_GOOGLE_AUTH_FAILED",
      502,
      "Could not obtain Google Cloud access token",
    );
  }
  return token;
}

function parseJsonLine(line: string): unknown | null {
  const value = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!value || value === "[DONE]") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectText(value: unknown, output: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output);
    return;
  }

  const record = value as Record<string, unknown>;
  const content = record.content;
  if (content && typeof content === "object") {
    const parts = (content as Record<string, unknown>).parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part && typeof part === "object") {
          const text = (part as Record<string, unknown>).text;
          if (typeof text === "string" && text.trim()) output.push(text);
        }
      }
    }
  }

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    output.push(record.output_text);
  }
  if (typeof record.text === "string" && record.text.trim() && !content) {
    output.push(record.text);
  }

  for (const [key, child] of Object.entries(record)) {
    if (["content", "output_text", "text"].includes(key)) continue;
    collectText(child, output);
  }
}

function parseAgentResponse(raw: string): { text: string; events: unknown[] } {
  const trimmed = raw.trim();
  const events: unknown[] = [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) events.push(...parsed);
      else events.push(parsed);
    } catch {
      // Fall through to line parsing.
    }
  }

  if (events.length === 0) {
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseJsonLine(line);
      if (parsed !== null) events.push(parsed);
    }
  }

  const chunks: string[] = [];
  for (const event of events) collectText(event, chunks);
  const text = chunks.join("").trim();
  if (!text) {
    throw new OrderEngineError(
      "AI_PROVIDER_EMPTY_RESPONSE",
      502,
      "Google Agent Runtime returned no readable text",
      { eventCount: events.length },
    );
  }
  return { text, events };
}

export async function verifyGoogleAgentProvider(): Promise<{
  provider: "google-agent-platform" | "deterministic";
  model: string | null;
}> {
  const config = configFromEnv();
  if (!config) {
    if (deterministicFallbackAllowed()) {
      return { provider: "deterministic", model: null };
    }
    throw providerNotConfiguredError();
  }

  await getGoogleAccessToken(config);
  return {
    provider: "google-agent-platform",
    model: `reasoningEngines/${config.engineId}`,
  };
}

export async function generateWithGoogleAgent(input: {
  prompt: string;
  context: unknown;
  mode: "read_only" | "draft";
  userId: string;
}): Promise<GoogleAgentResult> {
  const config = configFromEnv();
  if (!config) {
    if (!deterministicFallbackAllowed()) throw providerNotConfiguredError();
    return {
      provider: "deterministic",
      model: null,
      text:
        input.mode === "read_only"
          ? `Đã tổng hợp dữ liệu theo yêu cầu: ${input.prompt}`
          : `Bản nháp được tạo từ yêu cầu: ${input.prompt}`,
      data: { context: input.context, fallbackReason: "explicit_non_production_fallback" },
      usage: {},
    };
  }

  const token = await getGoogleAccessToken(config);
  const timeoutMs = Number(process.env.GOOGLE_AGENT_TIMEOUT_MS || 90_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify({
        classMethod: "async_stream_query",
        input: {
          user_id: input.userId,
          message: `${input.prompt}\n\nDữ liệu do backend Bếp Sỉ cấp theo quyền người dùng:\n${JSON.stringify(input.context)}`,
        },
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new OrderEngineError(
        "AI_PROVIDER_FAILED",
        502,
        `Google Agent Runtime returned ${response.status}`,
        { status: response.status, body: raw.slice(0, 1000) },
      );
    }

    const parsed = parseAgentResponse(raw);
    return {
      provider: "google-agent-platform",
      model: `reasoningEngines/${config.engineId}`,
      text: parsed.text,
      data: {
        context: input.context,
        project: config.project,
        location: config.location,
        engineId: config.engineId,
        eventCount: parsed.events.length,
      },
      usage: {},
    };
  } catch (error) {
    if (error instanceof OrderEngineError) throw error;
    if ((error as { name?: string }).name === "AbortError") {
      throw new OrderEngineError(
        "AI_PROVIDER_TIMEOUT",
        504,
        `Google Agent Runtime timed out after ${timeoutMs}ms`,
      );
    }
    throw new OrderEngineError(
      "AI_PROVIDER_FAILED",
      502,
      error instanceof Error ? error.message : "Google Agent Runtime request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const __testing = {
  deterministicFallbackAllowed,
  missingConfigKeys,
  parseAgentResponse,
};
