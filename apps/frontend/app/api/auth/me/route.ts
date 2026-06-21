import { NextResponse } from "next/server";
import { getBackendAuthorizationHeaders } from "@/lib/backend-auth";
import { proxyBackendJson } from "@/lib/backend-api";
import { getFrontendDataMode } from "@/lib/data-mode";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (getFrontendDataMode() === "static") {
      return NextResponse.json({
        mode: "static",
        identityKind: "static",
        customerProfileRequired: false,
        canViewWholesalePrice: false,
        canPlaceOrder: false,
      });
    }
    const headers = await getBackendAuthorizationHeaders();
    if (!headers) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    return proxyBackendJson("/api/auth/me", { headers });
  } catch (error) {
    console.error("account identity proxy failed", error);
    return NextResponse.json({ error: "BACKEND_IDENTITY_UNAVAILABLE" }, { status: 503 });
  }
}
