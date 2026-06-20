import { NextResponse } from "next/server";
import { getRecipeOfferDetailBySlug, isRecipeApprovedForFrontendCatalogPhase } from "@/data/recipes/recipe-offers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
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
