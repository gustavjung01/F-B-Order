import { NextRequest, NextResponse } from "next/server";
import { listCatalogProducts } from "@/data/catalog/catalog-service";

export const dynamic = "force-static";

function getOptionalParam(request: NextRequest, key: string) {
  const value = request.nextUrl.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function getLimit(request: NextRequest) {
  const value = getOptionalParam(request, "limit");
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const result = listCatalogProducts({
    categoryId: getOptionalParam(request, "categoryId"),
    subcategoryId: getOptionalParam(request, "subcategoryId"),
    q: getOptionalParam(request, "q"),
    productType: getOptionalParam(request, "productType"),
    catalogKind: getOptionalParam(request, "catalogKind"),
    limit: getLimit(request),
  });

  return NextResponse.json(result);
}
