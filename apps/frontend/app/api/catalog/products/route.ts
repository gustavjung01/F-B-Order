import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";
import { getFrontendDataMode } from "@/lib/data-mode";
import { getStaticProducts } from "@/lib/static-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    if (getFrontendDataMode() === "static") {
      const products = getStaticProducts({
        categoryId: query.get("categoryId"),
        search: query.get("q"),
        limit: Number(query.get("limit") || 80),
      });
      return NextResponse.json({ products, total: products.length });
    }

    const { getToken } = await auth();
    const token = await getToken();
    const queryString = query.toString();
    const pathname = queryString ? `/api/catalog/products?${queryString}` : "/api/catalog/products";
    return await proxyBackendJson(pathname, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch (error) {
    console.error("catalog products request failed", error);
    return NextResponse.json(
      { error: "CATALOG_SOURCE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
