import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.toString();
    const pathname = query ? `/api/catalog/products?${query}` : "/api/catalog/products";
    return await proxyBackendJson(pathname);
  } catch (error) {
    console.error("catalog products proxy failed", error);
    return NextResponse.json(
      { error: "BACKEND_CATALOG_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
