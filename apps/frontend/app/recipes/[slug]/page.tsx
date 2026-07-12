import { RecipeDetailClient } from "@/components/recipes/RecipeDetailClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

type RecipeDetailPageProps = {
  params: {
    slug: string;
  };
};

export default function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  return (
    <ResponsivePageShell active="recipes" title="Chi tiết công thức" subtitle="Hướng dẫn và định lượng">
      <RecipeDetailClient slug={params.slug} />
    </ResponsivePageShell>
  );
}
