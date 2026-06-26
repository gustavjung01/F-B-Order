import { AiProviderError } from "./ai-gateway.provider";
import type { VertexAccessTokenProvider } from "./vertex-ai.provider";

const TOKEN_ENDPOINT =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

type FetchLike = typeof fetch;

export function createGoogleCloudTokenProvider(fetchImpl: FetchLike = fetch): VertexAccessTokenProvider {
  let cached: { token: string; expiresAt: number } | null = null;

  return async () => {
    const localToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
    if (localToken) return localToken;
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    let response: Response;
    try {
      response = await fetchImpl(TOKEN_ENDPOINT, {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      throw new AiProviderError(
        "VERTEX_CREDENTIALS_UNAVAILABLE",
        503,
        "Google Cloud runtime credentials are unavailable.",
        false,
        error instanceof Error ? { cause: error.name } : undefined,
      );
    }

    if (!response.ok) {
      throw new AiProviderError(
        "VERTEX_CREDENTIALS_UNAVAILABLE",
        503,
        "Google Cloud metadata service did not issue credentials.",
      );
    }

    const payload = await response.json() as { access_token?: string; expires_in?: number };
    const token = payload.access_token?.trim();
    if (!token) {
      throw new AiProviderError(
        "VERTEX_CREDENTIALS_UNAVAILABLE",
        503,
        "Google Cloud metadata response is missing an access token.",
      );
    }
    const expiresIn = Number.isFinite(payload.expires_in) ? Math.max(60, Number(payload.expires_in)) : 300;
    cached = { token, expiresAt: Date.now() + expiresIn * 1_000 };
    return token;
  };
}
