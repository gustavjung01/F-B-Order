"use client";

import type { CatalogV2DetailResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { PurchaseRowCard } from "./PurchaseRowCard";
import { usePurchaseCartAction } from "./usePurchaseCartAction";
import { usePurchaseRowState } from "./usePurchaseRowState";

type Props = {
  detail: CatalogV2DetailResponse;
  initialVariantId: string;
  onVariantChange?: (variant: CatalogV2VariantCard) => void;
};

export function MultiPurchaseSelector(props: Props) {
  const state = usePurchaseRowState(props.detail, props.initialVariantId, props.onVariantChange);
  const cart = usePurchaseCartAction({
    rowCount: state.rows.length,
    completeRows: state.completeRows,
    groupedItems: state.groupedItems,
    totalQuantity: state.totalQuantity,
    setMessage: state.setMessage,
  });

  return (
    <section className="mt-3">
      <div className="mb-2">
        <h3 className="text-base font-black text-[#0b1220]">Phân loại mua hàng</h3>
        <p className="mt-0.5 text-[11px] font-bold text-slate-500">Mỗi dòng là một size/vị và số lượng riêng.</p>
      </div>

      <div className="space-y-2.5">
        {state.resolvedRows.map((item, index) => (
          <PurchaseRowCard
            key={item.row.id}
            detail={props.detail}
            item={item}
            index={index}
            rowCount={state.rows.length}
            openControlKey={state.openControlKey}
            setOpenControlKey={state.setOpenControlKey}
            updateOption={state.updateOption}
            updateChoice={state.updateChoice}
            updateQuantity={state.updateQuantity}
            removeRow={state.removeRow}
            hasSelectableGroups={state.hasSelectableGroups}
          />
        ))}
      </div>

      {state.hasSelectableGroups ? (
        <button type="button" onClick={state.addSelectionRow} className="mt-2.5 h-11 w-full rounded-[16px] border border-dashed border-[#ffb98f] bg-[#fff8f3] text-sm font-black text-[#ff5a00]">
          + Thêm phân loại
        </button>
      ) : null}

      {state.message ? (
        <p aria-live="polite" className={`mt-2 rounded-[12px] p-2.5 text-xs font-black ${state.message.startsWith("Đã thêm") ? "bg-[#e9fbf2] text-[#08775f]" : "bg-red-50 text-red-700"}`}>
          {state.message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void cart.addAllToCart()}
        disabled={cart.adding || state.rows.length === 0}
        className="mt-2.5 h-12 w-full rounded-[16px] bg-[#ff5a00] px-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(255,90,0,0.2)] disabled:bg-slate-300 disabled:shadow-none"
      >
        {cart.adding
          ? "Đang thêm..."
          : state.completeRows.length === state.rows.length
            ? `Thêm ${state.groupedItems.length} phân loại · ${state.totalQuantity} sản phẩm vào giỏ`
            : "Chọn đủ phân loại để thêm giỏ"}
      </button>
    </section>
  );
}
