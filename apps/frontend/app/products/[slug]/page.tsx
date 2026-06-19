import { ProductDetailClient } from "@/components/products/ProductDetailClient";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

type ProductDetailPageProps = {
  params: {
    slug: string;
  };
};

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  return (
    <ResponsivePageShell active="products" title="Chi tiết sản phẩm" subtitle="Catalog nguyên liệu">
      <ProductDetailClient slug={params.slug} />
    </ResponsivePageShell>
  );
}
