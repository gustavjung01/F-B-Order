import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

async function getAuthorizationHeader() {
  const { getToken } = await auth();
  const token = await getToken();
  return token ? { authorization: `Bearer ${token}` } : undefined;
}

export async function GET() {
  try {
    return await proxyBackendJson("/api/auth/profile", {
      headers: await getAuthorizationHeader(),
    });
  } catch (error) {
    console.error("customer profile proxy failed", error);
    return NextResponse.json({ error: "CUSTOMER_PROFILE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    return await proxyBackendJson("/api/auth/profile", {
      method: "POST",
      body: await request.text(),
      headers: await getAuthorizationHeader(),
    });
  } catch (error) {
    console.error("customer profile proxy failed", error);
    return NextResponse.json({ error: "CUSTOMER_PROFILE_UNAVAILABLE" }, { status: 503 });
  }
}
