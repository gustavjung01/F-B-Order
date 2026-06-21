import { NextResponse } from "next/server";
import { RECIPES_PUBLIC_STATUS } from "@/data/recipes/public-status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "RECIPE_FEATURE_DELAYED",
      featureStatus: RECIPES_PUBLIC_STATUS,
      message: "Tính năng Công thức đang được phát triển.",
    },
    { status: 404 },
  );
}
