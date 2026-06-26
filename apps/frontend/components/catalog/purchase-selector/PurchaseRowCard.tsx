"use client";

import type { CatalogV2DetailResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { getCatalogV2PriceLabel } from "@/lib/catalog-v2-display";
import { ChoiceControl } from "./ChoiceControl";
import { availableValues, type ResolvedSelectionRow } from "./selection-model";
import { usePurchaseCartAction } from "./usePurchaseCartAction";
import { usePurchaseRowState } from "./usePurchaseRowState";

export function PurchaseRowCard(props: {
  detail: CatalogV2DetailResponse;
  item: ResolvedSelectionRow;
  index: number;
  rowCount: number;
  openControlKey: string | null;
  setOpenControlKey: (value: string | null | ((current: string | null) => string | null)) => void;
  updateOption: (rowId: number, groupIndex: number, key: string, value: string) => void;
  updateChoice: (rowId: number, key: string, value: string) => void;
  updateQuantity: (rowId: number, quantity: number) => void;
  removeRow: (rowId: number) => void;
  hasSelectableGroups: boolean;
}) {
  const { row, variant, choiceGroups, label } = props.item;
  return (
    <div className="rounded-[14px] bg-[#fbfaf7] p-2.5 ring-1 ring-[#e7dccd]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-[#0b1220]">Phân loại {props.index + 1}</p>
        {props.rowCount > 1 ? (
          <button type="button" onClick={() => props.removeRow(row.id)} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-red-600 ring-1 ring-red-100">
            Xóa
          </button>
        ) : null}
      </div>

      {props.hasSelectableGroups ? (
        <div className="space-y-2">
          {props.detail.optionGroups.map((group, groupIndex) => {
            const controlKey = `${row.id}:option:${group.key}`;
            return (
              <ChoiceControl
                key={group.key}
                controlId={`choices-${row.id}-option-${group.key}`}
                name={group.name}
                values={availableValues(props.detail, row.options, group)}
                selected={row.options[group.key] || ""}
                expanded={props.openControlKey === controlKey}
                onToggle={() => props.setOpenControlKey((current) => current === controlKey ? null : controlKey)}
                onSelect={(value) => props.updateOption(row.id, groupIndex, group.key, value)}
              />
            );
          })}
          {choiceGroups.map((group) => {
            const controlKey = `${row.id}:choice:${group.key}`;
            return (
              <ChoiceControl
                key={group.key}
                controlId={`choices-${row.id}-choice-${group.key}`}
                name={group.name}
                values={group.values}
                selected={row.choices[group.key] || ""}
                expanded={props.openControlKey === controlKey}
                onToggle={() => props.setOpenControlKey((current) => current === controlKey ? null : controlKey)}
                onSelect={(value) => props.updateChoice(row.id, group.key, value)}
              />
            );
          })}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 rounded-[12px] bg-white p-2 ring-1 ring-[#e7dccd]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-slate-700">{label || "Chưa chọn đủ phân loại"}</p>
          <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-[9px] font-black text-slate-400">{variant?.sku || "Chưa chọn"}</p>
            <p className="shrink-0 text-sm font-black text-[#ff5a00]">{variant ? getCatalogV2PriceLabel(variant) : "Chọn phân loại"}</p>
          </div>
        </div>
        <div className="grid h-9 w-24 shrink-0 grid-cols-3 overflow-hidden rounded-[10px] border border-[#e7dccd] bg-white text-sm font-black">
          <button type="button" onClick={() => props.updateQuantity(row.id, row.quantity - 1)}>−</button>
          <span className="grid place-items-center border-x border-[#e7dccd]">{row.quantity}</span>
          <button type="button" onClick={() => props.updateQuantity(row.id, row.quantity + 1)}>+</button>
        </div>
      </div>
    </div>
  );
}

export function MultiPurchaseSelector(props: {
  detail: CatalogV2DetailResponse;
  initialVariantId: string;
  onVariantChange?: (variant: CatalogV2VariantCard) => void;
}) {
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
