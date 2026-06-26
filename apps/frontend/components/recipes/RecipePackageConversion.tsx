import type { PublicRecipeIngredient } from "@/data/recipes/public-model";
import { RECIPE_UNIT_LABELS } from "@/data/recipes/public-model";
import { formatRecipeNumber } from "./recipe-detail-utils";

export function RecipePackageConversion({ value }: { value: NonNullable<PublicRecipeIngredient["packageConversion"]> }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600">
      <div className="rounded-[14px] bg-[#fbfaf7] px-3 py-2 ring-1 ring-[#eee7dc]">
        Quy cách: {formatRecipeNumber(value.packageContentQuantity)} {RECIPE_UNIT_LABELS[value.packageContentUnit]}
      </div>
      <div className="rounded-[14px] bg-[#fbfaf7] px-3 py-2 ring-1 ring-[#eee7dc]">
        Hiệu suất: {formatRecipeNumber(value.usableYieldPercent)}%
      </div>
    </div>
  );
}
