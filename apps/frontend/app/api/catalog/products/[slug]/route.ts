import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";
import { getFrontendDataMode } from "@/lib/data-mode";
import { getStaticProduct } from "@/lib/static-catalog";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    slug: string;
  };
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    if (getFrontendDataMode() === "static") {
      const product = getStaticProduct(params.slug);
      if (!product) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ product });
    }

    const { getToken } = await auth();
    const token = await getToken();
    return await proxyBackendJson(`/api/catalog/products/${encodeURIComponent(params.slug)}`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch (error) {
    console.error("catalog product request failed", error);
    return NextResponse.json(
      { error: "CATALOG_SOURCE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
