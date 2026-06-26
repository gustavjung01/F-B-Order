import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

function noStore(response: Response): Response {
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.toString();
    return noStore(await proxyBackendJson(query ? `/api/recipes?${query}` : "/api/recipes"));
  } catch (error) {
    console.error("public recipe list proxy failed", error);
    return NextResponse.json({ error: "RECIPE_SOURCE_UNAVAILABLE" }, { status: 503 });
  }
}
