"use client";

import { useMemo, useRef, useState } from "react";
import type {
  CatalogV2DetailResponse,
  CatalogV2OptionGroup,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import {
  getCatalogV2OrderLabel,
  getCatalogV2PriceHeading,
  getCatalogV2PriceLabel,
} from "@/lib/catalog-v2-display";
import { addCartItem } from "@/lib/cartStorage";

type SelectionRow = {
  id: number;
  options: Record<string, string>;
  quantity: number;
};

type CatalogVariantSelectorProps = {
  detail: CatalogV2DetailResponse;
  initialVariantId: string;
  onPrimaryVariantChange?: (variant: CatalogV2VariantCard) => void;
};

function addErrorMessage(status: number, code?: string) {
  if (status === 401 || code === "AUTH_REQUIRED") return "Bạn cần đăng nhập trước khi thêm giỏ.";
  if (code === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi đặt hàng.";
  if (code === "CUSTOMER_NOT_APPROVED") return "Hồ sơ quán chưa được duyệt.";
  if (code === "MARKET_PRICE") return "Sản phẩm thời giá chưa thể thêm trực tiếp.";
  if (code === "DEALER_PRICE_UNAVAILABLE") return "Sản phẩm chưa có giá đại lý.";
  return "Không thêm được sản phẩm vào giỏ.";
}

function optionsFromVariant(
  variant: CatalogV2VariantCard,
  groups: CatalogV2OptionGroup[],
) {
  return Object.fromEntries(
    groups
      .map((group) => [group.key, variant.options[group.key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])),
  );
}

function findVariant(
  detail: CatalogV2DetailResponse,
  row: SelectionRow,
): CatalogV2VariantCard | null {
  if (detail.optionGroups.length === 0) {
    return detail.variants[0] || null;
  }
  const complete = detail.optionGroups.every((group) => Boolean(row.options[group.key]));
  if (!complete) return null;
  return detail.variants.find((variant) => (
    detail.optionGroups.every((group) => variant.options[group.key] === row.options[group.key])
  )) || null;
}

function availableValues(
  detail: CatalogV2DetailResponse,
  row: SelectionRow,
  targetGroup: CatalogV2OptionGroup,
) {
  return targetGroup.values.filter((value) => detail.variants.some((variant) => {
    if (variant.options[targetGroup.key] !== value) return false;
    return detail.optionGroups.every((group) => (
      group.key === targetGroup.key ||
      !row.options[group.key] ||
      variant.options[group.key] === row.options[group.key]
    ));
  }));
}

export function CatalogVariantSelector({
  detail,
  initialVariantId,
  onPrimaryVariantChange,
}: CatalogVariantSelectorProps) {
  const nextId = useRef(2);
  const initialVariant = detail.variants.find((variant) => variant.variant_id === initialVariantId)
    || detail.variants[0];
  const [rows, setRows] = useState<SelectionRow[]>([
    {
      id: 1,
      options: initialVariant ? optionsFromVariant(initialVariant, detail.optionGroups) : {},
      quantity: 1,
    },
  ]);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  const resolvedRows = useMemo(
    () => rows.map((row) => ({ row, variant: findVariant(detail, row) })),
    [detail, rows],
  );
  const validRows = resolvedRows.filter(
    (item): item is { row: SelectionRow; variant: CatalogV2VariantCard } => Boolean(item.variant),
  );
  const totalQuantity = validRows.reduce((total, item) => total + item.row.quantity, 0);
  const uniqueVariantCount = new Set(validRows.map((item) => item.variant.variant_id)).size;
  const firstBlockedVariant = validRows.find((item) => !item.variant.isOrderable)?.variant || null;

  function updateOption(rowId: number, groupIndex: number, groupKey: string, value: string) {
    const currentRowIndex = rows.findIndex((row) => row.id === rowId);
    const currentRow = rows[currentRowIndex];
    if (!currentRow) return;

    const nextOptions = { ...currentRow.options, [groupKey]: value };
    for (let index = groupIndex + 1; index < detail.optionGroups.length; index += 1) {
      delete nextOptions[detail.optionGroups[index].key];
    }
    const nextRow = { ...currentRow, options: nextOptions };
    setRows((current) => current.map((row) => (row.id === rowId ? nextRow : row)));

    if (currentRowIndex === 0) {
      const exact = findVariant(detail, nextRow);
      if (exact) onPrimaryVariantChange?.(exact);
    }
    setMessage("");
  }

  function updateQuantity(rowId: number, quantity: number) {
    setRows((current) => current.map((row) => (
      row.id === rowId ? { ...row, quantity: Math.max(1, quantity) } : row
    )));
  }

  function removeRow(rowId: number) {
    setRows((current) => current.filter((row) => row.id !== rowId));
    setMessage("");
  }

  function addSelectionRow() {
    const last = rows[rows.length - 1];
    if (!last || !findVariant(detail, last)) {
      setMessage("Chọn đủ phân loại ở dòng hiện tại trước khi thêm dòng mới.");
      return;
    }

    const firstGroup = detail.optionGroups[0];
    const keepFirstGroup = detail.optionGroups.length > 1 && firstGroup && last.options[firstGroup.key];
    const nextOptions = keepFirstGroup ? { [firstGroup.key]: last.options[firstGroup.key] } : {};
    setRows((current) => [
      ...current,
      { id: nextId.current++, options: nextOptions, quantity: 1 },
    ]);
    setMessage("");
  }

  async function addAllToCart() {
    if (adding || firstBlockedVariant) return;
    if (validRows.length !== rows.length) {
      setMessage("Còn dòng chưa chọn đủ phân loại.");
      return;
    }

    const grouped = new Map<string, { variant: CatalogV2VariantCard; quantity: number }>();
    for (const item of validRows) {
      const current = grouped.get(item.variant.variant_id);
      grouped.set(item.variant.variant_id, {
        variant: item.variant,
        quantity: (current?.quantity || 0) + item.row.quantity,
      });
    }

    const items = [...grouped.values()];
    setAdding(true);
    setMessage("");
    try {
      const responses = await Promise.all(items.map(async (item) => {
        const response = await fetch("/api/cart-v2/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            variant_id: item.variant.variant_id,
            quantity: item.quantity,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return { response, body };
      }));

      const failed = responses.find((item) => !item.response.ok);
      if (failed) {
        setMessage(addErrorMessage(failed.response.status, failed.body.error));
        return;
      }

      for (const item of items) {
        addCartItem({ variantId: item.variant.variant_id, quantity: item.quantity });
      }
      setMessage(`Đã thêm ${items.length} phân loại, tổng ${totalQuantity} sản phẩm vào giỏ.`);
    } catch {
      setMessage("Không kết nối được backend giỏ hàng.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <div>
        <h3 className="text-lg font-black text-[#0b1220]">Chọn phân loại cần mua</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">Mỗi dòng là một tổ hợp sản phẩm và số lượng riêng.</p>
      </div>

      {resolvedRows.map(({ row, variant }, rowIndex) => (
        <div key={row.id} className="rounded-[22px] bg-[#fbfaf7] p-4 ring-1 ring-[#e7dccd]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-black text-[#0b1220]">Phân loại {rowIndex + 1}</p>
            {rows.length > 1 ? (
              <button type="button" onClick={() => removeRow(row.id)} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-red-600 ring-1 ring-red-100">
                Xóa
              </button>
            ) : null}
          </div>

          {detail.optionGroups.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {detail.optionGroups.map((group, groupIndex) => {
                const values = availableValues(detail, row, group);
                return (
                  <label key={group.key} className="grid gap-1.5">
                    <span className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">{group.name}</span>
                    <select
                      value={row.options[group.key] || ""}
                      onChange={(event) => updateOption(row.id, groupIndex, group.key, event.target.value)}
                      className="h-11 rounded-[14px] border border-[#e7dccd] bg-white px-3 text-sm font-black text-[#0b1220] outline-none focus:border-[#ff5a00]"
                    >
                      <option value="">Chọn {group.name.toLowerCase()}</option>
                      {values.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {variant ? (
                <>
                  <p className="text-xs font-black text-slate-500">SKU: {variant.sku}</p>
                  <p className="mt-1 text-sm font-black text-[#ff5a00]">{getCatalogV2PriceHeading(variant)}: {getCatalogV2PriceLabel(variant)}</p>
                </>
              ) : (
                <p className="text-sm font-black text-amber-700">Chưa chọn đủ phân loại</p>
              )}
            </div>
            <div className="grid h-11 w-32 grid-cols-3 overflow-hidden rounded-[14px] border border-[#e7dccd] bg-white text-sm font-black text-[#0b1220]">
              <button type="button" onClick={() => updateQuantity(row.id, row.quantity - 1)}>−</button>
              <span className="grid place-items-center border-x border-[#e7dccd]">{row.quantity}</span>
              <button type="button" onClick={() => updateQuantity(row.id, row.quantity + 1)}>+</button>
            </div>
          </div>
        </div>
      ))}

      {detail.optionGroups.length > 0 ? (
        <button type="button" onClick={addSelectionRow} className="h-11 w-full rounded-[16px] border border-dashed border-[#ffb98f] bg-[#fff8f3] text-sm font-black text-[#ff5a00]">
          + Thêm phân loại
        </button>
      ) : null}

      {firstBlockedVariant && !message ? (
        <p className="rounded-[16px] bg-amber-50 p-3 text-sm font-black text-amber-800 ring-1 ring-amber-100">
          {firstBlockedVariant.priceMode === "market" ? "Sản phẩm đang để Thời giá." : "Đăng ký và chờ duyệt hồ sơ quán để đặt hàng."}
        </p>
      ) : null}

      {message ? (
        <p className={`rounded-[16px] p-3 text-sm font-black ${message.startsWith("Đã thêm") ? "bg-[#e9fbf2] text-[#08775f]" : "bg-red-50 text-red-700"}`}>
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void addAllToCart()}
        disabled={adding || validRows.length === 0 || Boolean(firstBlockedVariant)}
        className="h-[52px] w-full rounded-[18px] bg-[#ff5a00] px-5 py-3.5 text-sm font-black text-white shadow-[0_14px_26px_rgba(255,90,0,0.22)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
      >
        {adding
          ? "Đang thêm..."
          : firstBlockedVariant
            ? getCatalogV2OrderLabel(firstBlockedVariant)
            : `Thêm ${uniqueVariantCount || 0} phân loại · ${totalQuantity || 0} sản phẩm vào giỏ`}
      </button>
    </div>
  );
}
