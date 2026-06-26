"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiPurchaseSelector as CompactPurchaseSelector } from "@/components/catalog/purchase-selector/MultiPurchaseSelector";
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
  const specs = [
    selected.sizeLabel,
    selected.packageLabel,
    selected.sellUnit ? `ĐVT: ${selected.sellUnit}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" className="absolute inset-0 h-full w-full" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 mx-auto flex h-[88dvh] max-h-[92vh] min-h-[680px] max-w-md flex-col overflow-hidden rounded-t-[30px] bg-[#f7f3eb] shadow-[0_-24px_80px_rgba(15,23,42,0.28)] ring-1 ring-white/80 max-[420px]:min-h-0">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between border-b border-[#eee7dc] px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Chọn phân loại</p>
            <p className="text-sm font-bold text-slate-500">Chọn quy cách và số lượng</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm ring-1 ring-[#eee7dc]">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 [-webkit-overflow-scrolling:touch]">
          <div className="grid min-h-[220px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[96px] ring-1 ring-white/80">
            {selected.image.url ? <img src={selected.image.url} alt={selected.name} className="h-full max-h-[300px] w-full object-contain" /> : "📦"}
          </div>
          <div className="mt-4">
            {selected.brand ? <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{selected.brand}</p> : null}
            <h2 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-[#0b1220]">{detail?.product.name || product.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span>Mã: {selected.sku}</span>
              {specs.map((value) => <span key={value} className="rounded-full bg-white px-2.5 py-1.5 ring-1 ring-[#eee7dc]">{value}</span>)}
            </div>
          </div>
          {selected.shortDescription ? <p className="mt-3 line-clamp-3 rounded-[18px] bg-white p-3.5 text-sm font-semibold leading-6 text-slate-600 ring-1 ring-[#eee7dc]">{selected.shortDescription}</p> : null}
          {loading ? <p className="mt-4 rounded-[18px] bg-white p-4 text-sm font-black text-slate-500 ring-1 ring-[#eee7dc]">Đang tải lựa chọn...</p> : null}
          {error ? <p className="mt-4 rounded-[18px] bg-red-50 p-4 text-sm font-black text-red-700">{error}</p> : null}
          {detail ? <CompactPurchaseSelector detail={detail} initialVariantId={selectedVariantId} onVariantChange={(variant) => setSelectedVariantId(variant.variant_id)} /> : null}
        </div>
      </section>
    </div>
  );
}
