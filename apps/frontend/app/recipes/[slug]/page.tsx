import { notFound } from "next/navigation";
import { RecipeDetailClient } from "@/components/recipes/RecipeDetailClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { fetchPublicRecipeDetail, fetchRelatedPublicRecipes } from "@/lib/recipes-server";

export const dynamic = "force-dynamic";

type RecipeDetailPageProps = {
  params: {
    slug: string;
  };
};

export default async function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  const recipe = await fetchPublicRecipeDetail(params.slug);
  if (!recipe) notFound();

  const related = await fetchRelatedPublicRecipes(recipe.id, 6).catch((error) => {
    console.error("related public recipes render failed", error);
    return { recipes: [], total: 0 };
  });

  return (
    <ResponsivePageShell active="recipes" title="Công thức" subtitle={recipe.title}>
      <RecipeDetailClient recipe={recipe} relatedRecipes={related.recipes} />
    </ResponsivePageShell>
  );
}
