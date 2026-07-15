import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyAdminRequest(request: NextRequest, context: RouteContext) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Admin authorization is required." },
        { status: 401 },
      );
    }

    const method = request.method.toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { error: "METHOD_NOT_ALLOWED", message: "Unsupported admin proxy method." },
        { status: 405 },
      );
    }

    const { path } = await context.params;
    const suffix = Array.isArray(path) ? path.filter(Boolean).join("/") : "";
    if (!suffix) {
      return NextResponse.json(
        { error: "ADMIN_PATH_REQUIRED", message: "An admin backend path is required." },
        { status: 400 },
      );
    }

    const pathname = `/api/admin/${suffix}${request.nextUrl.search || ""}`;
    const body = method === "GET" ? undefined : await request.text();

    return proxyBackendJson(pathname, {
      method,
      body: body || undefined,
      headers: { authorization },
    });
  } catch (error) {
    console.error("isolated admin backend proxy failed", error);
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
