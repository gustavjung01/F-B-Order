import { NextRequest } from "next/server";
import { proxyBackendJson } from "@/lib/backend-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  return proxyBackendJson(query ? `/api/public/recipes?${query}` : "/api/public/recipes");
}
