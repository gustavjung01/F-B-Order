"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogVariantSelector } from "@/components/catalog/CatalogVariantSelector";
import type {
  CatalogV2DetailResponse,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { fetchCatalogV2Detail } from "@/lib/catalog-v2-client";

function productEmoji(industryKey: string) {
  if (industryKey.includes("tra") || industryKey.includes("pha-che")) return "🧋";
  if (industryKey.includes("topping")) return "🧊";
  if (industryKey.includes("bot")) return "🥛";
  if (industryKey.includes("syrup") || industryKey.includes("mut")) return "🍓";
  return "📦";
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-white p-3 ring-1 ring-[#eee7dc]">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

export function ProductQuickView({ product, onClose }: { product: CatalogV2VariantCard; onClose: () => void }) {
  const [detail, setDetail] = useState<CatalogV2DetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(product.variant_id);
  const [loading, setLoading] = useState(true);
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

  const specificationRows = [
    selectedVariant.sizeLabel ? { label: "Dung tích / khối lượng", value: selectedVariant.sizeLabel } : null,
    selectedVariant.packageLabel ? { label: "Quy cách đóng gói", value: selectedVariant.packageLabel } : null,
    selectedVariant.sellUnit ? { label: "Đơn vị bán", value: selectedVariant.sellUnit } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" className="absolute inset-0 h-full w-full" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92vh] max-w-md flex-col overflow-hidden rounded-t-[30px] bg-[#f7f3eb] shadow-[0_-24px_80px_rgba(15,23,42,0.28)] ring-1 ring-white/80">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between border-b border-[#eee7dc] px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Chọn phân loại</p>
            <p className="text-sm font-bold text-slate-500">Một sản phẩm cha · nhiều biến thể</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm ring-1 ring-[#eee7dc]">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 [-webkit-overflow-scrolling:touch]">
          <div className="grid min-h-[220px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[96px] ring-1 ring-white/80">
            {selectedVariant.image.url ? <img src={selectedVariant.image.url} alt={selectedVariant.name} className="h-full w-full object-contain" /> : productEmoji(selectedVariant.industryKey)}
          </div>

          {selectedVariant.brand ? <p className="mt-4 text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{selectedVariant.brand}</p> : null}
          <h2 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-[#0b1220]">{detail?.product.name || product.name}</h2>
          <p className="mt-2 text-sm font-bold text-slate-500">Đang chọn SKU: {selectedVariant.sku}</p>

          {specificationRows.length > 0 ? (
            <div className={`mt-4 grid gap-2 ${specificationRows.length > 1 ? "grid-cols-2" : ""}`}>
              {specificationRows.map((item) => <SpecItem key={item.label} label={item.label} value={item.value} />)}
            </div>
          ) : (
            <p className="mt-4 rounded-[18px] bg-amber-50 p-3 text-sm font-black text-amber-800 ring-1 ring-amber-100">
              Dung tích hoặc khối lượng chưa được xác minh từ nguồn hàng.
            </p>
          )}

          {loading ? <p className="mt-4 rounded-[18px] bg-white p-4 text-sm font-black text-slate-500 ring-1 ring-[#eee7dc]">Đang tải phân loại...</p> : null}
          {message ? <p className="mt-4 rounded-[18px] bg-red-50 p-4 text-sm font-black text-red-700">{message}</p> : null}

          {detail ? (
            <CatalogVariantSelector
              detail={detail}
              initialVariantId={selectedVariantId}
              onPrimaryVariantChange={(variant) => setSelectedVariantId(variant.variant_id)}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
