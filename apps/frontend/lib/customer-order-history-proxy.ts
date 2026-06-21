import { NextRequest, NextResponse } from "next/server";
import { getBackendAuthorizationHeaders } from "./backend-auth";
import { proxyBackendJson } from "./backend-api";
import { getFrontendDataMode } from "./data-mode";

export async function getCustomerOrderHistory(request: NextRequest) {
  try {
    if (getFrontendDataMode() === "static") {
      return NextResponse.json({ orders: [], total: 0, mode: "static" });
    }
    const headers = await getBackendAuthorizationHeaders();
    if (!headers) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const query = request.nextUrl.searchParams.toString();
    return proxyBackendJson(query ? `/api/customer/orders?${query}` : "/api/customer/orders", { headers });
  } catch (error) {
    console.error("customer order history proxy failed", error);
    return NextResponse.json({ error: "BACKEND_ORDERS_UNAVAILABLE" }, { status: 503 });
  }
}
