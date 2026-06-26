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

function ChoiceControl(props: {
  groupKey: string;
  name: string;
  values: string[];
  selected: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  if (props.values.length <= 3) {
    return (
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{props.name}</legend>
        <div className="flex flex-wrap gap-1.5">
          {props.values.map((value) => {
            const active = props.selected === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => props.onSelect(value)}
                className={`min-h-10 rounded-[12px] border px-3 py-2 text-xs font-black transition active:scale-[0.98] ${
                  active
                    ? "border-[#ff5a00] bg-[#fff3e8] text-[#d84b00] ring-1 ring-[#ff5a00]"
                    : "border-[#e7dccd] bg-white text-slate-700 hover:border-[#ffb27a]"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{props.name}</p>
      <button
        type="button"
        aria-expanded={props.expanded}
        aria-controls={`choices-${props.groupKey}`}
        onClick={props.onToggle}
        className="flex h-11 w-full items-center justify-between rounded-[12px] border border-[#e7dccd] bg-white px-3 text-left text-sm font-black text-slate-700"
      >
        <span className="truncate">{props.selected || `Chọn ${props.name.toLowerCase()}`}</span>
        <span className={`ml-3 text-xs transition ${props.expanded ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {props.expanded ? (
        <div id={`choices-${props.groupKey}`} className="mt-2 max-h-44 overflow-y-auto rounded-[12px] border border-[#e7dccd] bg-white p-1.5 shadow-sm">
          {props.values.map((value) => {
            const active = props.selected === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => props.onSelect(value)}
                className={`flex min-h-10 w-full items-center rounded-[10px] px-3 text-left text-sm font-black ${
                  active ? "bg-[#fff3e8] text-[#d84b00]" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function selectedPurchaseLabel(
  detail: CatalogV2DetailResponse,
  options: Record<string, string>,
  choices: Record<string, string>,
) {
  const optionValues = detail.optionGroups
    .map((group) => options[group.key])
    .filter((value): value is string => Boolean(value));
  const choiceValues = (detail.choiceGroups ?? [])
    .map((group) => choices[group.key])
    .filter((value): value is string => Boolean(value));
  return [...optionValues, ...choiceValues].join(" · ");
}

export function CompactPurchaseSelector({ detail, initialVariantId, onVariantChange }: Props) {
  const rawChoiceGroups = detail.choiceGroups ?? [];
  const firstVariant = detail.variants.find((item) => item.variant_id === initialVariantId) || detail.variants[0];
  const [options, setOptions] = useState<Record<string, string>>(() => initialOptions(detail, firstVariant));
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const variant = useMemo(() => resolveVariant(detail, options), [detail, options]);
  const choiceGroups = useMemo(
    () => choiceGroupsForVariant(rawChoiceGroups, variant),
    [rawChoiceGroups, variant],
  );
  const choicesReady = choiceGroups.every((group) => !group.required || Boolean(choices[group.key]));
  const selectedLabel = selectedPurchaseLabel(detail, options, choices);

  function updateOption(groupIndex: number, key: string, value: string) {
    const next = { ...options, [key]: value };
    for (let index = groupIndex + 1; index < detail.optionGroups.length; index += 1) {
      const nextGroup = detail.optionGroups[index];
      const validValues = availableValues(detail, next, nextGroup);
      const currentValue = next[nextGroup.key];
      if (!currentValue || !validValues.includes(currentValue)) {
        if (validValues.length === 1) next[nextGroup.key] = validValues[0];
        else delete next[nextGroup.key];
      }
    }
    setOptions(next);
    setOpenGroupKey(null);
    const resolved = resolveVariant(detail, next);
    setChoices((current) => retainValidChoices(current, rawChoiceGroups, resolved));
    if (resolved) onVariantChange?.(resolved);
    setMessage("");
  }

  async function addToCart() {
    if (!variant || !choicesReady || adding) {
      setMessage("Chọn đủ phân loại cần thiết.");
      return;
    }
    if (!variant.isOrderable) {
      setMessage(selectedLabel ? `Đã chọn ${selectedLabel}. ${getCatalogV2OrderLabel(variant)}.` : getCatalogV2OrderLabel(variant));
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
      setMessage(`Đã thêm ${quantity}${selectedLabel ? ` × ${selectedLabel}` : " sản phẩm"} vào giỏ.`);
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
        <div className="space-y-3 rounded-[16px] bg-[#fbfaf7] p-3 ring-1 ring-[#e7dccd]">
          {detail.optionGroups.map((group, index) => (
            <ChoiceControl
              key={group.key}
              groupKey={group.key}
              name={group.name}
              values={availableValues(detail, options, group)}
              selected={options[group.key] || ""}
              expanded={openGroupKey === group.key}
              onToggle={() => setOpenGroupKey((current) => current === group.key ? null : group.key)}
              onSelect={(value) => updateOption(index, group.key, value)}
            />
          ))}
          {choiceGroups.map((group) => (
            <ChoiceControl
              key={group.key}
              groupKey={group.key}
              name={group.name}
              values={group.values}
              selected={choices[group.key] || ""}
              expanded={openGroupKey === group.key}
              onToggle={() => setOpenGroupKey((current) => current === group.key ? null : group.key)}
              onSelect={(value) => {
                setChoices((current) => ({ ...current, [group.key]: value }));
                setOpenGroupKey(null);
                setMessage("");
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[16px] bg-[#fbfaf7] p-2.5 ring-1 ring-[#e7dccd]">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black text-slate-500">{variant?.sku || "Chưa chọn đủ phân loại"}</p>
          {selectedLabel ? <p className="mt-0.5 truncate text-xs font-black text-slate-700">Đã chọn: {selectedLabel}</p> : null}
          <p className="mt-0.5 text-sm font-black text-[#ff5a00]">{variant ? getCatalogV2PriceLabel(variant) : "Chọn phân loại"}</p>
        </div>
        <div className="grid h-10 w-28 shrink-0 grid-cols-3 overflow-hidden rounded-[12px] border border-[#e7dccd] bg-white text-sm font-black">
          <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
          <span className="grid place-items-center border-x border-[#e7dccd]">{quantity}</span>
          <button type="button" onClick={() => setQuantity((value) => value + 1)}>+</button>
        </div>
      </div>
      {message ? <p className={`mt-2 rounded-[12px] p-2.5 text-xs font-black ${message.startsWith("Đã thêm") ? "bg-[#e9fbf2] text-[#08775f]" : "bg-red-50 text-red-700"}`}>{message}</p> : null}
      <button type="button" onClick={() => void addToCart()} disabled={adding || !variant || !choicesReady} className="mt-2.5 h-12 w-full rounded-[16px] bg-[#ff5a00] text-sm font-black text-white shadow-[0_12px_24px_rgba(255,90,0,0.2)] disabled:bg-slate-300 disabled:shadow-none">
        {adding ? "Đang thêm..." : selectedLabel ? `Thêm ${selectedLabel} vào giỏ` : "Thêm vào giỏ"}
      </button>
    </section>
  );
}
