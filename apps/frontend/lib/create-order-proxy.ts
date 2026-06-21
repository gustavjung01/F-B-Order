import { NextRequest, NextResponse } from "next/server";
import { getBackendAuthorizationHeaders } from "./backend-auth";
import { proxyBackendJson } from "./backend-api";
import { getFrontendDataMode } from "./data-mode";

export async function proxyCreateOrder(request: NextRequest) {
  try {
    if (getFrontendDataMode() === "static") {
      return NextResponse.json({ error: "STATIC_MODE_ORDER_DISABLED" }, { status: 409 });
    }
    const headers = await getBackendAuthorizationHeaders();
    if (!headers) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const requestKey = request.headers.get("idempotency-key")?.trim();
    if (!requestKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
    headers.set("idempotency-key", requestKey);
    return proxyBackendJson("/api/orders", {
      method: "POST",
      body: await request.text(),
      headers,
    });
  } catch (error) {
    console.error("create order proxy failed", error);
    return NextResponse.json({ error: "BACKEND_ORDERS_UNAVAILABLE" }, { status: 503 });
  }
}
