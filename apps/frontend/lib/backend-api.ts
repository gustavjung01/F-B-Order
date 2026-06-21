const BACKEND_API_URL = (
  process.env.BACKEND_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || ""
).replace(/\/$/, "");

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
    },
  });
}
