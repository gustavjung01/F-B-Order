import { getDb } from "../../db/pool";
import { createGoogleCloudTokenProvider } from "./google-cloud-token.provider";
import { AiGatewayService } from "./ai-gateway.service";
import { VertexAiProvider } from "./vertex-ai.provider";

export type AiGatewayRuntime = {
  service: AiGatewayService | null;
  provider: "vertex_ai" | "disabled";
  model: string | null;
};

function requiredEnv(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required when AI_PROVIDER=vertex_ai.`);
  return normalized;
}

function timeoutFromEnv(value: string | undefined) {
  if (!value?.trim()) return 30_000;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 120_000) {
    throw new Error("AI_REQUEST_TIMEOUT_MS must be an integer from 1000 to 120000.");
  }
  return parsed;
}

export function createAiGatewayRuntimeFromEnv(): AiGatewayRuntime {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "disabled";
  if (provider === "disabled") return { service: null, provider: "disabled", model: null };
  if (provider !== "vertex_ai") {
    throw new Error("AI_PROVIDER must be disabled or vertex_ai.");
  }

  const projectId = requiredEnv(
    "AI_VERTEX_PROJECT_ID",
    process.env.AI_VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  );
  const location = (
    process.env.AI_VERTEX_LOCATION
    || process.env.GOOGLE_CLOUD_LOCATION
    || "asia-southeast1"
  ).trim();
  const model = requiredEnv("AI_VERTEX_MODEL", process.env.AI_VERTEX_MODEL);
  const vertex = new VertexAiProvider({
    projectId,
    location,
    model,
    timeoutMs: timeoutFromEnv(process.env.AI_REQUEST_TIMEOUT_MS),
    tokenProvider: createGoogleCloudTokenProvider(),
  });

  return {
    service: new AiGatewayService(vertex, getDb()),
    provider: "vertex_ai",
    model,
  };
}
