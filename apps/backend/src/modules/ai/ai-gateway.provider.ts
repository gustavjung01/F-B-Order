import type {
  AiGatewayUsage,
  AiJsonObject,
  AiJsonSchema,
  AiUseCase,
} from "./ai-schema";

export type AiProviderResponseSpec =
  | { format: "text" }
  | { format: "json"; schema: AiJsonSchema };

export type AiProviderRequest = {
  requestId: string;
  useCase: AiUseCase;
  model: string;
  systemInstruction: string;
  input: {
    text: string;
    context?: AiJsonObject;
  };
  response: AiProviderResponseSpec;
  controls: {
    temperature: number;
    maxOutputTokens: number;
  };
};

export type AiProviderResult = {
  text: string;
  usage: AiGatewayUsage;
  finishReason: string | null;
  safetyMetadata: Record<string, unknown>;
};

export interface AiProvider {
  readonly name: "vertex_ai" | "mock";
  readonly model: string;
  generate(request: AiProviderRequest): Promise<AiProviderResult>;
}

export class AiProviderError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryable = false,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
