import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    slug: string;
  };
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    return await proxyBackendJson(`/api/catalog/products/${encodeURIComponent(params.slug)}`);
  } catch (error) {
    console.error("catalog product proxy failed", error);
    return NextResponse.json(
      { error: "BACKEND_CATALOG_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
