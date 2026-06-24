import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

    const body = await request.text();
    return await proxyBackendJson("/catalog/cart/items", {
      method: "POST",
      body,
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error("catalog v2 cart request failed", error);
    return NextResponse.json({ error: "CATALOG_V2_CART_UNAVAILABLE" }, { status: 503 });
  }
}
