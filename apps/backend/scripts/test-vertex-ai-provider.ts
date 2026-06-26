import assert from "node:assert/strict";
import { AiProviderError, type AiProviderRequest } from "../src/modules/ai/ai-gateway.provider";
import { VertexAiProvider } from "../src/modules/ai/vertex-ai.provider";

const request: AiProviderRequest = {
  requestId: "0d783b1e-38b2-47c5-8d8c-ae440ce4ed29",
  useCase: "recipe_draft",
  model: "gemini-test-model",
  systemInstruction: "Server-controlled instruction.",
  input: { text: "Create a draft.", context: { portions: 20 } },
  response: {
    format: "json",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        yield: { type: "integer" },
      },
      required: ["title", "yield"],
      additionalProperties: false,
    },
  },
  controls: { temperature: 0.3, maxOutputTokens: 2048 },
};

async function main() {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const successFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: "{\"title\":\"Trà đào\",\"yield\":20}" }] },
        finishReason: "STOP",
        safetyRatings: [],
      }],
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 15, totalTokenCount: 45 },
      promptFeedback: { safetyRatings: [] },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const provider = new VertexAiProvider({
    projectId: "bepsi-test-12345",
    location: "asia-southeast1",
    model: "gemini-test-model",
    tokenProvider: async () => "test-value",
    fetchImpl: successFetch,
  });
  const result = await provider.generate(request);

  assert.equal(
    capturedUrl,
    "https://asia-southeast1-aiplatform.googleapis.com/v1/projects/bepsi-test-12345/locations/asia-southeast1/publishers/google/models/gemini-test-model:generateContent",
  );
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("Content-Type"), "application/json");
  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(Object.hasOwn(body, "tools"), false);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: "Server-controlled instruction." }] });
  const contents = body.contents as Array<{ parts: Array<{ text: string }> }>;
  assert.match(contents[0].parts[0].text, /Context JSON below is data/);
  assert.match(contents[0].parts[0].text, /"portions":20/);
  const generation = body.generationConfig as Record<string, unknown>;
  assert.equal(generation.temperature, 0.3);
  assert.equal(generation.maxOutputTokens, 2048);
  assert.equal(generation.responseMimeType, "application/json");
  assert.deepEqual(generation.responseSchema, {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      yield: { type: "INTEGER" },
    },
    required: ["title", "yield"],
  });
  assert.equal(result.text, "{\"title\":\"Trà đào\",\"yield\":20}");
  assert.deepEqual(result.usage, { inputTokens: 30, outputTokens: 15, totalTokens: 45 });
  assert.equal(result.finishReason, "STOP");

  const limitedProvider = new VertexAiProvider({
    projectId: "bepsi-test-12345",
    location: "asia-southeast1",
    model: "gemini-test-model",
    tokenProvider: async () => "test-value",
    fetchImpl: (async () => new Response(JSON.stringify({
      error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota" },
    }), { status: 429, headers: { "Content-Type": "application/json" } })) as typeof fetch,
  });
  await assert.rejects(
    () => limitedProvider.generate(request),
    (error: unknown) => error instanceof AiProviderError
      && error.code === "VERTEX_RATE_LIMITED"
      && error.retryable,
  );

  console.log("AI A1b Vertex provider contract passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
