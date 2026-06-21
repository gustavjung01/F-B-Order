import { NextResponse } from "next/server";
import { getRecipeOfferDetailBySlug, isRecipeApprovedForFrontendCatalogPhase } from "@/data/recipes/recipe-offers";
import { RECIPES_PUBLIC_ENABLED, RECIPES_PUBLIC_STATUS } from "@/data/recipes/public-status";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  if (!RECIPES_PUBLIC_ENABLED) {
    return NextResponse.json(
      {
        error: "RECIPE_FEATURE_DELAYED",
        featureStatus: RECIPES_PUBLIC_STATUS,
        message: "Tính năng Công thức đang được phát triển.",
      },
      { status: 404 },
    );
  }

  const slug = decodeURIComponent(params.slug);
  const approved = isRecipeApprovedForFrontendCatalogPhase();
  const recipe = getRecipeOfferDetailBySlug(slug, approved);

  if (!recipe) {
    return NextResponse.json({ error: "Không tìm thấy công thức" }, { status: 404 });
  }

  return NextResponse.json({
    approved,
    recipe,
  });
}
