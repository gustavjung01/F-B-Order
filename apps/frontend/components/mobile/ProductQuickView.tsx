"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CatalogV2DetailResponse,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { fetchCatalogV2Detail } from "@/lib/catalog-v2-client";
import {
  getCatalogV2OrderLabel,
  getCatalogV2PriceHeading,
  getCatalogV2PriceLabel,
  getCatalogV2PriceNote,
} from "@/lib/catalog-v2-display";
import { addCartItem } from "@/lib/cartStorage";

function productEmoji(industryKey: string) {
  if (industryKey.includes("tra") || industryKey.includes("pha-che")) return "🧋";
  if (industryKey.includes("topping")) return "🧊";
  if (industryKey.includes("bot")) return "🥛";
  if (industryKey.includes("syrup") || industryKey.includes("mut")) return "🍓";
  return "📦";
}

function addErrorMessage(status: number, code?: string) {
  if (status === 401 || code === "AUTH_REQUIRED") return "Bạn cần đăng nhập trước khi thêm giỏ.";
  if (code === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi đặt hàng.";
  if (code === "CUSTOMER_NOT_APPROVED") return "Hồ sơ quán chưa được duyệt.";
  if (code === "MARKET_PRICE") return "Sản phẩm thời giá chưa thể thêm trực tiếp.";
  if (code === "SHOP_PRICE_UNAVAILABLE") return "Sản phẩm chưa thiết lập giá quán.";
  return "Không thêm được sản phẩm vào giỏ.";
}

export function ProductQuickView({ product, onClose }: { product: CatalogV2VariantCard; onClose: () => void }) {
  const [detail, setDetail] = useState<CatalogV2DetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(product.variant_id);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      try {
        setLoading(true);
        setMessage("");
        const data = await fetchCatalogV2Detail(product.variant_id);
        if (!active) return;
        setDetail(data);
        setSelectedVariantId(data.selectedVariantId || product.variant_id);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Không tải được sản phẩm");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDetail();
    return () => {
      active = false;
    };
  }, [product.variant_id]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const selectedVariant = useMemo(
    () => detail?.variants.find((variant) => variant.variant_id === selectedVariantId) || product,
    [detail, product, selectedVariantId],
  );

  function selectOption(groupName: string, value: string) {
    if (!detail) return;
    const nextOptions = { ...selectedVariant.options, [groupName]: value };
    const exactMatch = detail.variants.find((variant) => (
      detail.optionGroups.every((group) => variant.options[group.name] === nextOptions[group.name])
    ));
    const fallback = detail.variants.find((variant) => variant.options[groupName] === value);
    const nextVariant = exactMatch || fallback;
    if (nextVariant) {
      setSelectedVariantId(nextVariant.variant_id);
      setMessage("");
    }
  }

  function optionAvailable(groupName: string, value: string) {
    if (!detail) return false;
    return detail.variants.some((variant) => {
      if (variant.options[groupName] !== value) return false;
      return detail.optionGroups.every((group) => (
        group.name === groupName ||
        selectedVariant.options[group.name] === undefined ||
        variant.options[group.name] === selectedVariant.options[group.name]
      ));
    });
  }

  async function handleAdd() {
    if (!selectedVariant.isOrderable || adding) return;
    setAdding(true);
    setMessage("");
    try {
      const response = await fetch("/api/cart-v2/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variant_id: selectedVariant.variant_id,
          quantity,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(addErrorMessage(response.status, data.error));
        return;
      }
      addCartItem({ variantId: selectedVariant.variant_id, quantity });
      setMessage("Đã thêm đúng phân loại vào giỏ.");
    } catch {
      setMessage("Không kết nối được backend giỏ hàng.");
    } finally {
      setAdding(false);
    }
  }

  const priceNote = getCatalogV2PriceNote(selectedVariant);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" className="absolute inset-0 h-full w-full" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90vh] max-w-md flex-col overflow-hidden rounded-t-[30px] bg-[#f7f3eb] shadow-[0_-24px_80px_rgba(15,23,42,0.28)] ring-1 ring-white/80">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between border-b border-[#eee7dc] px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Chọn đúng phân loại</p>
            <p className="text-sm font-bold text-slate-500">{selectedVariant.sku}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm ring-1 ring-[#eee7dc]">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 [-webkit-overflow-scrolling:touch]">
          <div className="grid min-h-[220px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[96px] ring-1 ring-white/80">
            {selectedVariant.image.url ? <img src={selectedVariant.image.url} alt={selectedVariant.name} className="h-full w-full object-contain" /> : productEmoji(selectedVariant.industryKey)}
          </div>

          {selectedVariant.brand ? <p className="mt-4 text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{selectedVariant.brand}</p> : null}
          <h2 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-[#0b1220]">{selectedVariant.name}</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">SKU: {selectedVariant.sku}</p>

          <div className="mt-4 grid gap-2">
            <div className="rounded-[18px] bg-white p-3 ring-1 ring-[#eee7dc]">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Dung tích / khối lượng</p>
              <p className="mt-1 text-sm font-black">{selectedVariant.sizeLabel || "Chưa có trong bảng nguồn"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[18px] bg-white p-3 ring-1 ring-[#eee7dc]">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Quy cách</p>
                <p className="mt-1 text-sm font-black">{selectedVariant.packageLabel || "Đang cập nhật"}</p>
              </div>
              <div className="rounded-[18px] bg-white p-3 ring-1 ring-[#eee7dc]">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Đơn vị bán</p>
                <p className="mt-1 text-sm font-black">{selectedVariant.sellUnit || "Đang cập nhật"}</p>
              </div>
            </div>
          </div>

          {loading ? <p className="mt-4 rounded-[18px] bg-white p-4 text-sm font-black text-slate-500 ring-1 ring-[#eee7dc]">Đang tải phân loại...</p> : null}

          {detail?.optionGroups.map((group) => (
            <div key={group.name} className="mt-5">
              <h3 className="text-sm font-black text-[#0b1220]">{group.name}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.values.map((value) => {
                  const selected = selectedVariant.options[group.name] === value;
                  const available = optionAvailable(group.name, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!available}
                      onClick={() => selectOption(group.name, value)}
                      className={`rounded-[14px] px-4 py-2.5 text-sm font-black ring-1 ${selected ? "bg-[#ff5a00] text-white ring-[#ff5a00]" : available ? "bg-white text-[#0b1220] ring-[#e7dccd]" : "bg-slate-100 text-slate-300 ring-slate-200"}`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-5 rounded-[20px] bg-[#fff3ea] p-4 ring-1 ring-[#ffd0b3]">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#ff5a00]">{getCatalogV2PriceHeading(selectedVariant)}</p>
            <p className="mt-1 text-2xl font-black text-[#ff5a00]">{getCatalogV2PriceLabel(selectedVariant)}</p>
            {priceNote ? <p className="mt-2 text-sm font-bold text-slate-600">{priceNote}</p> : null}
            {!selectedVariant.isOrderable ? <p className="mt-2 text-sm font-bold text-slate-600">{getCatalogV2OrderLabel(selectedVariant)}</p> : null}
          </div>

          {message ? <p className={`mt-4 rounded-[18px] p-4 text-sm font-black ${message.startsWith("Đã thêm") ? "bg-[#e9fbf2] text-[#08775f]" : "bg-red-50 text-red-700"}`}>{message}</p> : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-[#eee7dc] bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="grid h-12 w-32 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] text-[16px] font-black text-[#0b1220]">
              <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="bg-white active:bg-[#fff3ea]">−</button>
              <span className="grid place-items-center border-x border-[#eee7dc]">{quantity}</span>
              <button type="button" onClick={() => setQuantity((current) => current + 1)} className="bg-white active:bg-[#fff3ea]">+</button>
            </div>
            <button type="button" onClick={() => void handleAdd()} disabled={!selectedVariant.isOrderable || adding} className="h-12 flex-1 rounded-[16px] bg-[#ff5a00] px-4 text-[14px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
              {adding ? "Đang thêm..." : getCatalogV2OrderLabel(selectedVariant)}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
