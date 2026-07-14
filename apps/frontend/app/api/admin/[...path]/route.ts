import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyAdminRequest(request: NextRequest, context: RouteContext) {
  try {
    const { path } = await context.params;
    const suffix = Array.isArray(path) ? path.join("/") : "";
    const search = request.nextUrl.search || "";
    const pathname = `/api/admin/${suffix}${search}`;
    const authorization = request.headers.get("authorization");

    if (!authorization) {
      return NextResponse.json({ error: "AUTH_REQUIRED", message: "Admin authorization is required." }, { status: 401 });
    }

    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

    return proxyBackendJson(pathname, {
      method,
      body: body || undefined,
      headers: { authorization },
    });
  } catch (error) {
    console.error("admin backend proxy failed", error);
    return NextResponse.json(
      { error: "ADMIN_BACKEND_UNAVAILABLE", message: "Không kết nối được API quản trị." },
      { status: 503 },
    );
  }
}

export const GET = proxyAdminRequest;
export const POST = proxyAdminRequest;
export const PATCH = proxyAdminRequest;
export const PUT = proxyAdminRequest;
export const DELETE = proxyAdminRequest;
