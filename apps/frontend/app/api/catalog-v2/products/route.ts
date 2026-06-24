import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    const queryString = request.nextUrl.searchParams.toString();
    const pathname = queryString ? `/catalog/products?${queryString}` : "/catalog/products";

    return await proxyBackendJson(pathname, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch (error) {
    console.error("catalog v2 products request failed", error);
    return NextResponse.json({ error: "CATALOG_V2_SOURCE_UNAVAILABLE" }, { status: 503 });
  }
}
