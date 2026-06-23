import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    const id = encodeURIComponent(context.params.id);

    return await proxyBackendJson(`/catalog/products/${id}`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch (error) {
    console.error("catalog v2 product detail request failed", error);
    return NextResponse.json({ error: "CATALOG_V2_SOURCE_UNAVAILABLE" }, { status: 503 });
  }
}
