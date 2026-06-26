import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import {
  addCartItem,
  createCartSelectionKey,
  getCartItemKey,
  readCartItems,
} from "@/lib/cartStorageV4";
import { cartErrorText, type ResolvedSelectionRow } from "./selection-model";

export type GroupedPurchase = {
  key: string;
  variant: CatalogV2VariantCard;
  choices: Record<string, string>;
  quantity: number;
};

export function groupPurchases(rows: Array<ResolvedSelectionRow & { variant: CatalogV2VariantCard }>) {
  const grouped = new Map<string, GroupedPurchase>();
  for (const item of rows) {
    const selectionKey = createCartSelectionKey(item.row.choices);
    const key = `${item.variant.variant_id}::${selectionKey}`;
    const current = grouped.get(key);
    grouped.set(key, {
      key,
      variant: item.variant,
      choices: item.row.choices,
      quantity: (current?.quantity || 0) + item.row.quantity,
    });
  }
  return [...grouped.values()];
}

export async function syncPurchasesToCart(items: GroupedPurchase[]) {
  const existingByKey = new Map(readCartItems().map((item) => [getCartItemKey(item), item]));
  const responses = await Promise.all(items.map(async (item) => {
    const existingQuantity = existingByKey.get(item.key)?.quantity || 0;
    const response = await fetch("/api/cart-v2/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variant_id: item.variant.variant_id,
        quantity: existingQuantity + item.quantity,
        selections: item.choices,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { response, body };
  }));
  const failed = responses.find((item) => !item.response.ok);
  if (failed) throw new Error(cartErrorText(failed.response.status, failed.body.error));
  for (const item of items) {
    addCartItem({
      variantId: item.variant.variant_id,
      quantity: item.quantity,
      selections: item.choices,
    });
  }
}
