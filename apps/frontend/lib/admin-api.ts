import { API_URL } from "./api";

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

function browserAdminProxyPath(path: string): string {
  if (path === "/api/admin") return "/api/backend-admin";
  if (path.startsWith("/api/admin/")) {
    return `/api/backend-admin/${path.slice("/api/admin/".length)}`;
  }
  return path;
}

function adminRequestUrl(path: string): string {
  if (!path.startsWith("/")) throw new Error("Admin API path must start with '/'.");

  // Server-side callers use the authenticated backend API directly. Browser
  // callers use an isolated same-origin namespace so legacy /api/admin routes
  // cannot intercept the request with ADMIN_API_MOVED.
  return typeof window === "undefined"
    ? `${API_URL}${path}`
    : browserAdminProxyPath(path);
}

export async function adminApiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(adminRequestUrl(path), {
    ...options,
    headers,
    cache: "no-store",
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
