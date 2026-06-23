"use client";

import Link from "next/link";
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

type ProductDetailClientProps = {
  slug: string;
};

function ProductState({ children }: { children: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#e7dccd] bg-white/75 px-6 py-10 text-center text-[16px] font-black text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-[#fbfaf7] px-4 py-3 ring-1 ring-[#eee7dc]">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-[#0b1220]">{value}</p>
    </div>
  );
}

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

export function ProductDetailClient({ slug }: ProductDetailClientProps) {
  const [detail, setDetail] = useState<CatalogV2DetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(slug);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let activeRequest = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchCatalogV2Detail(slug);
        if (!activeRequest) return;
        setDetail(data);
        setSelectedVariantId(data.selectedVariantId || slug);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setDetail(null);
      } finally {
        if (activeRequest) setLoading(false);
      }
    }

    void loadProduct();
    return () => {
      activeRequest = false;
    };
  }, [slug]);

  const selectedVariant = useMemo<CatalogV2VariantCard | null>(
    () => detail?.variants.find((variant) => variant.variant_id === selectedVariantId) || null,
    [detail, selectedVariantId],
  );

  function selectOption(groupName: string, value: string) {
    if (!detail || !selectedVariant) return;
    const nextOptions = { ...selectedVariant.options, [groupName]: value };
    const exactMatch = detail.variants.find((variant) => (
      detail.optionGroups.every((group) => variant.options[group.name] === nextOptions[group.name])
    ));
    const fallback = detail.variants.find((variant) => variant.options[groupName] === value);
    const nextVariant = exactMatch || fallback;
    if (nextVariant) {
      setSelectedVariantId(nextVariant.variant_id);
      setMessage("");
      window.history.replaceState(null, "", `/products/${nextVariant.variant_id}`);
    }
  }

  function optionAvailable(groupName: string, value: string) {
    if (!detail || !selectedVariant) return false;
    return detail.variants.some((variant) => {
      if (variant.options[groupName] !== value) return false;
      return detail.optionGroups.every((group) => (
        group.name === groupName ||
        selectedVariant.options[group.name] === undefined ||
        variant.options[group.name] === selectedVariant.options[group.name]
      ));
    });
  }

  async function handleAddToCart() {
    if (!selectedVariant?.isOrderable || adding) return;
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

  if (loading) return <ProductState>Đang tải phân loại sản phẩm...</ProductState>;
  if (error) return <ProductState>{error}</ProductState>;
  if (!detail || !selectedVariant) return <ProductState>Không có dữ liệu sản phẩm</ProductState>;

  const priceNote = getCatalogV2PriceNote(selectedVariant);

  return (
    <div className="space-y-6">
      <Link href="/products" className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">
        ← Quay lại sản phẩm
      </Link>

      <section className="grid gap-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start">
        <div className="overflow-hidden rounded-[32px] bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc]">
          <div className="grid min-h-[280px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[112px] md:min-h-[420px]">
            {selectedVariant.image.url ? <img src={selectedVariant.image.url} alt={selectedVariant.name} className="h-full w-full object-contain" /> : productEmoji(selectedVariant.industryKey)}
          </div>
        </div>

        <div className="rounded-[32px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc] md:p-7">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{detail.product.industry}</span>
            {detail.product.subcategory ? <span className="rounded-full bg-[#fbfaf7] px-3 py-1.5 text-[12px] font-black text-slate-600 ring-1 ring-[#eee7dc]">{detail.product.subcategory}</span> : null}
            {detail.product.brand ? <span className="rounded-full bg-[#eefbf6] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{detail.product.brand}</span> : null}
          </div>

          <h2 className="mt-4 text-[30px] font-black leading-tight tracking-tight text-[#0b1220] md:text-5xl">{selectedVariant.name}</h2>
          <p className="mt-3 text-sm font-black text-slate-500">SKU: {selectedVariant.sku}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoRow label="Dung tích / khối lượng" value={selectedVariant.sizeLabel || "Chưa có trong bảng nguồn"} />
            <InfoRow label="Quy cách đóng gói" value={selectedVariant.packageLabel || "Đang cập nhật"} />
            <InfoRow label="Đơn vị bán" value={selectedVariant.sellUnit || "Đang cập nhật"} />
          </div>

          {detail.optionGroups.map((group) => (
            <div key={group.name} className="mt-6">
              <h3 className="text-sm font-black text-[#0b1220]">{group.name}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
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

          <div className="mt-6 rounded-[24px] bg-[#fff3ea] p-5 ring-1 ring-[#ffd0b3]">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#ff5a00]">{getCatalogV2PriceHeading(selectedVariant)}</p>
            <p className="mt-2 text-3xl font-black text-[#ff5a00]">{getCatalogV2PriceLabel(selectedVariant)}</p>
            {priceNote ? <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{priceNote}</p> : null}
            {!selectedVariant.isOrderable ? <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{getCatalogV2OrderLabel(selectedVariant)}</p> : null}
          </div>

          {message ? <p className={`mt-4 rounded-[18px] p-4 text-sm font-black ${message.startsWith("Đã thêm") ? "bg-[#e9fbf2] text-[#08775f]" : "bg-red-50 text-red-700"}`}>{message}</p> : null}

          <div className="mt-6 flex gap-3">
            <div className="grid h-12 w-32 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] text-[16px] font-black text-[#0b1220]">
              <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="bg-white active:bg-[#fff3ea]">−</button>
              <span className="grid place-items-center border-x border-[#eee7dc]">{quantity}</span>
              <button type="button" onClick={() => setQuantity((current) => current + 1)} className="bg-white active:bg-[#fff3ea]">+</button>
            </div>
            <button type="button" onClick={() => void handleAddToCart()} disabled={!selectedVariant.isOrderable || adding} className="flex h-12 flex-1 items-center justify-center rounded-[18px] bg-[#ff5a00] px-6 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(255,90,0,0.2)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
              {adding ? "Đang thêm..." : getCatalogV2OrderLabel(selectedVariant)}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
