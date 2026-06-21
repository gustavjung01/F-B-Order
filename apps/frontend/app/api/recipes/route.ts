import { NextRequest, NextResponse } from "next/server";
import { RECIPES_PUBLIC_STATUS } from "@/data/recipes/public-status";

export const dynamic = "force-dynamic";

function getLimit(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("limit");
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    approved: false,
    featureStatus: RECIPES_PUBLIC_STATUS,
    filters: {
      category: null,
      brand: null,
      search: null,
      limit: getLimit(request),
    },
    recipes: [],
  });
}
