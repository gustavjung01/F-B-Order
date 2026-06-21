import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";
import { getFrontendDataMode } from "@/lib/data-mode";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (getFrontendDataMode() === "static") {
      return NextResponse.json(
        { error: "STATIC_MODE_ORDER_DISABLED", message: "Cart validation is disabled in static mode." },
        { status: 409 },
      );
    }

    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const body = await request.text();
    return await proxyBackendJson("/api/cart/validate", {
      method: "POST",
      body,
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error("cart validation proxy failed", error);
    return NextResponse.json({ error: "BACKEND_CART_UNAVAILABLE" }, { status: 503 });
  }
}
