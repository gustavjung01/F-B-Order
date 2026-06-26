import assert from "node:assert/strict";
import {
  AI_SCHEMA_VERSION,
  AiSchemaError,
  parseAiGatewayRequest,
  parseAiJsonSchema,
} from "../src/modules/ai/ai-schema";

function expectSchemaError(run: () => unknown, code: string) {
  assert.throws(
    run,
    (error: unknown) => error instanceof AiSchemaError && error.code === code,
    `Expected AiSchemaError ${code}`,
  );
}

const textRequest = parseAiGatewayRequest({
  schemaVersion: AI_SCHEMA_VERSION,
  useCase: "operations_assistant",
  input: {
    text: "  Tổng hợp việc cần làm hôm nay.  ",
    context: { orderCount: 12, urgent: true },
  },
  response: { format: "text" },
  metadata: { correlationId: "ops-20260627" },
});

assert.equal(textRequest.input.text, "Tổng hợp việc cần làm hôm nay.");
assert.deepEqual(textRequest.controls, { temperature: 0.2, maxOutputTokens: 1024 });
assert.deepEqual(textRequest.input.context, { orderCount: 12, urgent: true });
assert.deepEqual(textRequest.metadata, { correlationId: "ops-20260627" });

const jsonRequest = parseAiGatewayRequest({
  schemaVersion: AI_SCHEMA_VERSION,
  useCase: "recipe_draft",
  input: { text: "Tạo bản nháp công thức trà đào." },
  response: {
    format: "json",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        yield: { type: "integer" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string", enum: ["g", "ml", "piece"] },
            },
            required: ["name", "quantity", "unit"],
          },
        },
      },
      required: ["title", "yield", "ingredients"],
    },
  },
  controls: { temperature: 0.35, maxOutputTokens: 2048 },
});

assert.equal(jsonRequest.response.format, "json");
assert.equal(jsonRequest.controls.temperature, 0.35);
assert.equal(jsonRequest.controls.maxOutputTokens, 2048);
if (jsonRequest.response.format === "json") {
  assert.equal(jsonRequest.response.schema.additionalProperties, false);
  assert.equal(jsonRequest.response.schema.properties?.ingredients.items?.type, "object");
}

expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, schemaVersion: "2.0" }),
  "UNSUPPORTED_SCHEMA_VERSION",
);
expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, useCase: "arbitrary_prompt" }),
  "INVALID_USE_CASE",
);
expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, systemInstruction: "client supplied" }),
  "UNKNOWN_FIELD",
);
expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, input: { text: "   " } }),
  "EMPTY_INPUT",
);
expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, controls: { temperature: 2 } }),
  "INVALID_TEMPERATURE",
);
expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, controls: { maxOutputTokens: 9000 } }),
  "INVALID_MAX_OUTPUT_TOKENS",
);
expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, response: { format: "xml" } }),
  "INVALID_RESPONSE_FORMAT",
);
expectSchemaError(
  () => parseAiJsonSchema({ type: "object", properties: {}, additionalProperties: false }),
  "INVALID_PROPERTY_COUNT",
);
expectSchemaError(
  () => parseAiJsonSchema({
    type: "object",
    properties: { title: { type: "string" } },
    required: ["missing"],
  }),
  "UNKNOWN_REQUIRED_PROPERTY",
);
expectSchemaError(
  () => parseAiJsonSchema({
    type: "object",
    properties: { title: { type: "string" } },
    additionalProperties: true,
  }),
  "ADDITIONAL_PROPERTIES_NOT_ALLOWED",
);
expectSchemaError(
  () => parseAiJsonSchema({ type: "string", ref: "title" }),
  "UNKNOWN_FIELD",
);
expectSchemaError(
  () => parseAiJsonSchema({ type: "array" }),
  "ITEMS_REQUIRED",
);
expectSchemaError(
  () => parseAiJsonSchema({ type: "integer", enum: [1, 1] }),
  "DUPLICATE_ENUM_VALUE",
);

const unsafeContext = JSON.parse('{"constructor":"unsafe"}') as unknown;
expectSchemaError(
  () => parseAiGatewayRequest({ ...textRequest, input: { text: "ok", context: unsafeContext } }),
  "FORBIDDEN_KEY",
);

console.log("AI A1a schema contract passed.");
