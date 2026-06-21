function normalizeBackendApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");

  // Vercel must receive the backend origin only. Accept an accidental trailing
  // /api as well so catalog requests never become /api/api/catalog/*.
  return normalized.replace(/\/api$/i, "");
}

const BACKEND_API_URL = normalizeBackendApiBaseUrl(
  process.env.BACKEND_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || "",
);

export function getBackendApiUrl(pathname: string): string {
  if (!BACKEND_API_URL) {
    throw new Error("BACKEND_API_URL or NEXT_PUBLIC_API_URL is required");
  }

  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${BACKEND_API_URL}${normalizedPath}`;
}

export async function proxyBackendJson(pathname: string): Promise<Response> {
  const upstream = await fetch(getBackendApiUrl(pathname), {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
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
