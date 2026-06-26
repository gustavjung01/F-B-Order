import type { PublicRecipeCard, PublicRecipeCatalogReference } from "@/data/recipes/public-model";

const recipeEmojiByCategory: Record<string, string> = {
  "cong-thuc-tra-sua": "🧋",
  "cong-thuc-tra-trai-cay": "🍹",
  "cong-thuc-do-uong-nong": "☕",
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
};

export function recipeEmoji(recipe: PublicRecipeCard) {
  return recipe.category ? recipeEmojiByCategory[recipe.category.slug] || "📋" : "📋";
}

export function formatRecipeNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(value);
}

export function formatStepDuration(seconds: number | null) {
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds} giây`;
  return `${Math.round(seconds / 60)} phút`;
}

export function catalogAvailabilityLabel(reference: PublicRecipeCatalogReference) {
  if (reference.availability === "available") return "Đang có trong Catalog";
  if (reference.availability === "inactive") return "Hiện không sẵn sàng đặt hàng";
  return "Không còn tìm thấy trong Catalog";
}

export function catalogAvailabilityClass(reference: PublicRecipeCatalogReference) {
  if (reference.availability === "available") return "bg-[#e9fbf2] text-[#08775f] ring-[#b9eadb]";
  if (reference.availability === "inactive") return "bg-[#fff3ea] text-[#c2410c] ring-[#ffd0b3]";
  return "bg-[#f8fafc] text-slate-500 ring-slate-200";
}
