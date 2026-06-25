"use client";

import { useMemo, useState } from "react";
import type {
  CatalogV2ChoiceGroup,
  CatalogV2DetailResponse,
  CatalogV2OptionGroup,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { getCatalogV2OrderLabel, getCatalogV2PriceLabel } from "@/lib/catalog-v2-display";
import { addCartItem } from "@/lib/cartStorageV4";

type Props = {
  detail: CatalogV2DetailResponse;
  initialVariantId: string;
  onVariantChange?: (variant: CatalogV2VariantCard) => void;
};

function initialOptions(detail: CatalogV2DetailResponse, variant: CatalogV2VariantCard | undefined) {
  return Object.fromEntries(
    detail.optionGroups
      .map((group) => [group.key, variant?.options[group.key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])),
  );
}

function resolveVariant(detail: CatalogV2DetailResponse, options: Record<string, string>) {
  if (detail.optionGroups.length === 0) return detail.variants[0] || null;
  if (!detail.optionGroups.every((group) => Boolean(options[group.key]))) return null;
  return detail.variants.find((variant) => (
    detail.optionGroups.every((group) => variant.options[group.key] === options[group.key])
  )) || null;
}

function availableValues(detail: CatalogV2DetailResponse, options: Record<string, string>, target: CatalogV2OptionGroup) {
  return target.values.filter((value) => detail.variants.some((variant) => (
    variant.options[target.key] === value
    && detail.optionGroups.every((group) => (
      group.key === target.key || !options[group.key] || variant.options[group.key] === options[group.key]
    ))
  )));
}

function choiceGroupsForVariant(groups: CatalogV2ChoiceGroup[], variant: CatalogV2VariantCard | null) {
  return groups.map((group) => ({
    ...group,
    values: variant ? group.valuesBySku?.[variant.sku] || group.values : group.values,
  }));
}

function retainValidChoices(
  current: Record<string, string>,
  groups: CatalogV2ChoiceGroup[],
  variant: CatalogV2VariantCard | null,
) {
  const activeGroups = choiceGroupsForVariant(groups, variant);
  return Object.fromEntries(Object.entries(current).filter(([key, value]) => (
    activeGroups.some((group) => group.key === key && group.values.includes(value))
  )));
}

function errorText(status: number, code?: string) {
  if (status === 401 || code === "AUTH_REQUIRED") return "Bạn cần đăng nhập trước khi thêm giỏ.";
  if (code === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi đặt hàng.";
  if (code === "CUSTOMER_NOT_APPROVED") return "Hồ sơ quán chưa được duyệt.";
  if (code === "SELECTION_REQUIRED") return "Chọn vị trước khi thêm giỏ.";
  if (code === "INVALID_SELECTION") return "Lựa chọn vị không hợp lệ.";
  return "Không thêm được sản phẩm vào giỏ.";
}

export function CompactPurchaseSelector({ detail, initialVariantId, onVariantChange }: Props) {
  const rawChoiceGroups = detail.choiceGroups ?? [];
  const firstVariant = detail.variants.find((item) => item.variant_id === initialVariantId) || detail.variants[0];
  const [options, setOptions] = useState<Record<string, string>>(() => initialOptions(detail, firstVariant));
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const variant = useMemo(() => resolveVariant(detail, options), [detail, options]);
  const choiceGroups = useMemo(
    () => choiceGroupsForVariant(rawChoiceGroups, variant),
    [rawChoiceGroups, variant],
  );
  const choicesReady = choiceGroups.every((group) => !group.required || Boolean(choices[group.key]));

  function updateOption(groupIndex: number, key: string, value: string) {
    const next = { ...options, [key]: value };
    for (let index = groupIndex + 1; index < detail.optionGroups.length; index += 1) delete next[detail.optionGroups[index].key];
    setOptions(next);
    const resolved = resolveVariant(detail, next);
    setChoices((current) => retainValidChoices(current, rawChoiceGroups, resolved));
    if (resolved) onVariantChange?.(resolved);
    setMessage("");
  }

  async function addToCart() {
    if (!variant || !choicesReady || adding) {
      setMessage("Chọn đủ size và vị.");
      return;
    }
    if (!variant.isOrderable) {
      setMessage(getCatalogV2OrderLabel(variant));
      return;
    }
    setAdding(true);
    setMessage("");
    try {
      const response = await fetch("/api/cart-v2/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant_id: variant.variant_id, quantity, selections: choices }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(errorText(response.status, body.error));
        return;
      }
      addCartItem({ variantId: variant.variant_id, quantity, selections: choices });
      setMessage(`Đã thêm ${quantity} sản phẩm vào giỏ.`);
    } catch {
      setMessage("Không thể cập nhật giỏ hàng. Vui lòng thử lại.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="mt-3">
      <h3 className="mb-2 text-base font-black text-[#0b1220]">Phân loại mua hàng</h3>
      {(detail.optionGroups.length > 0 || choiceGroups.length > 0) ? (
        <div className="grid grid-cols-2 gap-2">
          {detail.optionGroups.map((group, index) => (
            <label key={group.key} className="grid min-w-0 gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{group.name}</span>
              <select value={options[group.key] || ""} onChange={(event) => updateOption(index, group.key, event.target.value)} className="h-10 min-w-0 rounded-[12px] border border-[#e7dccd] bg-white px-2 text-xs font-black outline-none focus:border-[#ff5a00]">
                <option value="">Chọn</option>
                {availableValues(detail, options, group).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          ))}
          {choiceGroups.map((group) => (
            <label key={group.key} className="grid min-w-0 gap-1">
              <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{group.name}</span>
              <select value={choices[group.key] || ""} onChange={(event) => { setChoices((current) => ({ ...current, [group.key]: event.target.value })); setMessage(""); }} className="h-10 min-w-0 rounded-[12px] border border-[#e7dccd] bg-white px-2 text-xs font-black outline-none focus:border-[#ff5a00]">
                <option value="">Chọn</option>
                {group.values.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[16px] bg-[#fbfaf7] p-2.5 ring-1 ring-[#e7dccd]">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black text-slate-500">{variant?.sku || "Chưa chọn"}</p>
          <p className="mt-0.5 text-sm font-black text-[#ff5a00]">{variant ? getCatalogV2PriceLabel(variant) : "Chọn phân loại"}</p>
        </div>
        <div className="grid h-10 w-28 shrink-0 grid-cols-3 overflow-hidden rounded-[12px] border border-[#e7dccd] bg-white text-sm font-black">
          <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
          <span className="grid place-items-center border-x border-[#e7dccd]">{quantity}</span>
          <button type="button" onClick={() => setQuantity((value) => value + 1)}>+</button>
        </div>
      </div>
      {message ? <p className={`mt-2 rounded-[12px] p-2.5 text-xs font-black ${message.startsWith("Đã thêm") ? "bg-[#e9fbf2] text-[#08775f]" : "bg-red-50 text-red-700"}`}>{message}</p> : null}
      <button type="button" onClick={() => void addToCart()} disabled={adding || !variant || !choicesReady || !variant?.isOrderable} className="mt-2.5 h-12 w-full rounded-[16px] bg-[#ff5a00] text-sm font-black text-white shadow-[0_12px_24px_rgba(255,90,0,0.2)] disabled:bg-slate-300 disabled:shadow-none">
        {adding ? "Đang thêm..." : variant && !variant.isOrderable ? getCatalogV2OrderLabel(variant) : "Thêm vào giỏ"}
      </button>
    </section>
  );
}
