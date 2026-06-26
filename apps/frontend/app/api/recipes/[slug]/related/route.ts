import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    slug: string;
  };
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const limit = request.nextUrl.searchParams.get("limit");
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
    const response = await proxyBackendJson(`/api/recipes/${encodeURIComponent(params.slug)}/related${query}`);
    response.headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    return response;
  } catch (error) {
    console.error("related recipes proxy failed", error);
    return NextResponse.json({ error: "RECIPE_SOURCE_UNAVAILABLE" }, { status: 503 });
  }
}
