"use client";

import { useState } from "react";
import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { getCatalogV2OrderLabel } from "@/lib/catalog-v2-display";
import { syncPurchasesToCart, type GroupedPurchase } from "./cart-sync";
import type { ResolvedSelectionRow } from "./selection-model";

export function usePurchaseCartAction(input: {
  rowCount: number;
  completeRows: Array<ResolvedSelectionRow & { variant: CatalogV2VariantCard }>;
  groupedItems: GroupedPurchase[];
  totalQuantity: number;
  setMessage: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  async function addAllToCart() {
    if (adding) return;
    if (input.completeRows.length !== input.rowCount) {
      input.setMessage("Còn dòng chưa chọn đủ phân loại.");
      return;
    }
    const blocked = input.completeRows.find((item) => !item.variant.isOrderable);
    if (blocked) {
      input.setMessage(blocked.label
        ? `Đã chọn ${blocked.label}. ${getCatalogV2OrderLabel(blocked.variant)}.`
        : getCatalogV2OrderLabel(blocked.variant));
      return;
    }
    setAdding(true);
    input.setMessage("");
    try {
      await syncPurchasesToCart(input.groupedItems);
      input.setMessage(`Đã thêm ${input.groupedItems.length} phân loại · ${input.totalQuantity} sản phẩm vào giỏ.`);
    } catch (error) {
      input.setMessage(error instanceof Error ? error.message : "Không thể cập nhật giỏ hàng. Vui lòng thử lại.");
    } finally {
      setAdding(false);
    }
  }

  return { adding, addAllToCart };
}
