function normalizeBackendApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.replace(/\/api$/i, "");
}

const BACKEND_API_URL = normalizeBackendApiBaseUrl(
  process.env.BACKEND_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || "",
);

export function getBackendApiUrl(pathname: string): string {
  if (!BACKEND_API_URL) {
    throw new Error("BACKEND_API_URL or NEXT_PUBLIC_API_URL is required in backend mode");
  }

  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${BACKEND_API_URL}${normalizedPath}`;
}

type BackendProxyOptions = {
  method?: string;
  body?: string;
  headers?: HeadersInit;
};

export async function proxyBackendJson(
  pathname: string,
  options: BackendProxyOptions = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");
  if (options.body !== undefined) headers.set("content-type", "application/json");

  const upstream = await fetch(getBackendApiUrl(pathname), {
    method: options.method || "GET",
    body: options.body,
    cache: "no-store",
    headers,
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "x-bepsi-upstream-path": pathname,
      "x-bepsi-upstream-status": String(upstream.status),
    },
  });
}
