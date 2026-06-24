import { RecipeComingSoon } from "@/components/recipes/RecipeComingSoon";
import { RecipeListClient } from "@/components/recipes/RecipeListClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { RECIPES_PUBLIC_ENABLED } from "@/data/recipes/public-status";

export default function RecipesPage() {
  const content = RECIPES_PUBLIC_ENABLED ? <RecipeListClient /> : <RecipeComingSoon />;

  return (
    <ResponsivePageShell active="recipes" title="Công thức" subtitle="Hướng dẫn pha chế dành cho khách hàng">
      {content}
    </ResponsivePageShell>
  );
}
