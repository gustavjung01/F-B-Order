import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ApiOptions = RequestInit & {
  token?: string | null;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetchWithTimeout(`${API_URL}${path}`, {
    ...options,
    headers,
    timeoutMs: 10_000,
    timeoutMessage: "API phản hồi quá chậm, vui lòng thử lại.",
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
