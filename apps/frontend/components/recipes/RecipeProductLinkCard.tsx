import type { PublicRecipeProductLink } from "@/data/recipes/public-model";
import { RecipeCatalogReference } from "./RecipeCatalogReference";

export function RecipeProductLinkCard({ link }: { link: PublicRecipeProductLink }) {
  return (
    <article className="rounded-[22px] bg-white p-4 ring-1 ring-[#efe7dc]">
      <RecipeCatalogReference reference={link} />
      {link.note ? <p className="mt-3 text-[12px] font-semibold leading-6 text-slate-500">{link.note}</p> : null}
    </article>
  );
}
