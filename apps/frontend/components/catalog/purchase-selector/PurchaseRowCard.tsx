"use client";

import type { CatalogV2DetailResponse } from "@/data/catalog-v2/product-model";
import { getCatalogV2PriceLabel } from "@/lib/catalog-v2-display";
import { ChoiceControl } from "./ChoiceControl";
import { availableValues, type ResolvedSelectionRow } from "./selection-model";

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
    <div className="rounded-[16px] bg-[#fbfaf7] p-3 ring-1 ring-[#e7dccd]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-[#0b1220]">Phân loại {props.index + 1}</p>
        {props.rowCount > 1 ? (
          <button type="button" onClick={() => props.removeRow(row.id)} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-red-600 ring-1 ring-red-100">
            Xóa
          </button>
        ) : null}
      </div>

      {props.hasSelectableGroups ? (
        <div className="space-y-3">
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

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[14px] bg-white p-2.5 ring-1 ring-[#e7dccd]">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black text-slate-500">{variant?.sku || "Chưa chọn đủ phân loại"}</p>
          {label ? <p className="mt-0.5 truncate text-xs font-black text-slate-700">{label}</p> : null}
          <p className="mt-0.5 text-sm font-black text-[#ff5a00]">{variant ? getCatalogV2PriceLabel(variant) : "Chọn phân loại"}</p>
        </div>
        <div className="grid h-10 w-28 shrink-0 grid-cols-3 overflow-hidden rounded-[12px] border border-[#e7dccd] bg-white text-sm font-black">
          <button type="button" onClick={() => props.updateQuantity(row.id, row.quantity - 1)}>−</button>
          <span className="grid place-items-center border-x border-[#e7dccd]">{row.quantity}</span>
          <button type="button" onClick={() => props.updateQuantity(row.id, row.quantity + 1)}>+</button>
        </div>
      </div>
    </div>
  );
}
