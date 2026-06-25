"use client";

import { useEffect, useMemo, useState } from "react";
import { CompactPurchaseSelector } from "@/components/catalog/CompactPurchaseSelector";
import type { CatalogV2DetailResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { fetchCatalogV2Detail } from "@/lib/catalog-v2-client";

export function ProductQuickViewCompact({ product, onClose }: { product: CatalogV2VariantCard; onClose: () => void }) {
  const [detail, setDetail] = useState<CatalogV2DetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(product.variant_id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchCatalogV2Detail(product.variant_id)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setSelectedVariantId(data.selectedVariantId || product.variant_id);
      })
      .catch(() => active && setError("Không tải được thông tin sản phẩm"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [product.variant_id]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const selected = useMemo(
    () => detail?.variants.find((variant) => variant.variant_id === selectedVariantId) || product,
    [detail, product, selectedVariantId],
  );
  const specs = [selected.packageLabel, selected.sellUnit ? `ĐVT: ${selected.sellUnit}` : null].filter((item): item is string => Boolean(item));

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" className="absolute inset-0 h-full w-full" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92vh] max-w-md flex-col overflow-hidden rounded-t-[28px] bg-[#f7f3eb] shadow-[0_-24px_80px_rgba(15,23,42,0.28)]">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between border-b border-[#eee7dc] px-4 py-2.5">
          <p className="text-sm font-black text-[#0b1220]">Thông tin sản phẩm</p>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-black ring-1 ring-[#eee7dc]">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <div className="grid h-[150px] place-items-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[64px] ring-1 ring-white/80">
            {selected.image.url ? <img src={selected.image.url} alt={selected.name} className="h-full w-full object-contain" /> : "📦"}
          </div>
          <div className="mt-3">
            {selected.brand ? <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{selected.brand}</p> : null}
            <h2 className="mt-1 text-[22px] font-black leading-tight text-[#0b1220]">{detail?.product.name || product.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <span>{selected.sku}</span>
              {specs.map((value) => <span key={value} className="rounded-full bg-white px-2 py-1 ring-1 ring-[#eee7dc]">{value}</span>)}
            </div>
          </div>
          {selected.shortDescription ? <p className="mt-2.5 line-clamp-3 text-xs font-semibold leading-5 text-slate-600">{selected.shortDescription}</p> : null}
          {loading ? <p className="mt-3 rounded-[14px] bg-white p-3 text-xs font-black text-slate-500 ring-1 ring-[#eee7dc]">Đang tải lựa chọn...</p> : null}
          {error ? <p className="mt-3 rounded-[14px] bg-red-50 p-3 text-xs font-black text-red-700">{error}</p> : null}
          {detail ? <CompactPurchaseSelector detail={detail} initialVariantId={selectedVariantId} onVariantChange={(variant) => setSelectedVariantId(variant.variant_id)} /> : null}
        </div>
      </section>
    </div>
  );
}
