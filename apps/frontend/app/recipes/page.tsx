import { RecipeListClient } from "@/components/recipes/RecipeListClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { fetchPublicRecipeList } from "@/lib/recipes-server";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const initialResult = await fetchPublicRecipeList({ limit: 24 }).catch((error) => {
    console.error("initial public recipe render failed", error);
    return null;
  });

  return (
    <ResponsivePageShell
      active="recipes"
      title="Công thức"
      subtitle="Định lượng, cách làm và kinh nghiệm bán món thực chiến"
    >
      <RecipeListClient initialResult={initialResult} />
    </ResponsivePageShell>
  );
}
