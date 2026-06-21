import { redirect } from "next/navigation";
import { RecipeDetailClient } from "@/components/recipes/RecipeDetailClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { RECIPES_PUBLIC_ENABLED } from "@/data/recipes/public-status";

type RecipeDetailPageProps = {
  params: {
    slug: string;
  };
};

export default function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  if (!RECIPES_PUBLIC_ENABLED) {
    redirect("/recipes");
  }

  return (
    <ResponsivePageShell active="recipes" title="Chi tiết công thức" subtitle="Hướng dẫn và định lượng">
      <RecipeDetailClient slug={params.slug} />
    </ResponsivePageShell>
  );
}
