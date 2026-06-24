import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    variantId: string;
  };
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

    const variantId = encodeURIComponent(context.params.variantId);
    return await proxyBackendJson(`/catalog/cart/items/${variantId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error("catalog v2 cart delete request failed", error);
    return NextResponse.json({ error: "CATALOG_V2_CART_UNAVAILABLE" }, { status: 503 });
  }
}
