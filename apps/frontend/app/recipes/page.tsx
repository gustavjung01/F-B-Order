import { RecipeListClient } from "@/components/recipes/RecipeListClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function RecipesPage() {
  return (
    <ResponsivePageShell active="recipes" title="Công thức" subtitle="Tính năng đang được phát triển">
      <RecipeListClient />
    </ResponsivePageShell>
  );
}
