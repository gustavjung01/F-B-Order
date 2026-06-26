import Link from "next/link";
import type { PublicRecipeDetail } from "@/data/recipes/public-model";
import { RecipeProductLinkCard } from "./RecipeProductLinkCard";

export function RecipeCatalogSection({ recipe }: { recipe: PublicRecipeDetail }) {
  if (!recipe.productLinks.length) return null;
  return (
    <section className="rounded-[30px] bg-[#fbfaf7] p-5 ring-1 ring-[#efe7dc] md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#0b1220]">Nguyên liệu Bếp Sỉ liên quan</h2>
          <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-500">Thông tin tham khảo theo snapshot công thức; trạng thái mua hàng luôn được kiểm tra lại trong Catalog.</p>
        </div>
        <Link href="/products" className="rounded-[16px] bg-[#0b1220] px-4 py-2.5 text-[12px] font-black text-white">Xem danh mục nguyên liệu</Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{recipe.productLinks.map((link) => <RecipeProductLinkCard key={link.id} link={link} />)}</div>
    </section>
  );
}
