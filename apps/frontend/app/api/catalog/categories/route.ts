import { NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return await proxyBackendJson("/api/catalog/categories");
  } catch (error) {
    console.error("catalog categories proxy failed", error);
    return NextResponse.json(
      { error: "BACKEND_CATALOG_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
