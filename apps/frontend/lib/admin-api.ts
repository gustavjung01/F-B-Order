import { API_URL } from "./api";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function adminApiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetchWithTimeout(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    timeoutMs: 12_000,
    timeoutMessage: "Admin API phản hồi quá chậm, vui lòng thử lại.",
  });
  const raw = await response.text();
  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AdminApiError(
      response.status,
      payload?.error || "ADMIN_API_FAILED",
      payload?.message || `Admin API request failed with status ${response.status}.`,
      payload?.details,
    );
  }

  return payload as T;
}
