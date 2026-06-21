import { NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";
import { getFrontendDataMode } from "@/lib/data-mode";
import { getStaticCategories } from "@/lib/static-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (getFrontendDataMode() === "static") {
      const categories = getStaticCategories();
      return NextResponse.json({ categories, total: categories.length });
    }
    return await proxyBackendJson("/api/catalog/categories");
  } catch (error) {
    console.error("catalog categories request failed", error);
    return NextResponse.json(
      { error: "CATALOG_SOURCE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
