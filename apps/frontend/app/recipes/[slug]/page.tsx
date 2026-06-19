import { RecipeDetailClient } from "@/components/recipes/RecipeDetailClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

type RecipeDetailPageProps = {
  params: {
    slug: string;
  };
};

export default function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  return (
    <ResponsivePageShell active="recipes" title="Chi tiết công thức" subtitle="Nguyên liệu map về sản phẩm">
      <RecipeDetailClient slug={params.slug} />
    </ResponsivePageShell>
  );
}
