"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CatalogVariantSelector } from "@/components/catalog/CatalogVariantSelector";
import type {
  CatalogV2DetailResponse,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { fetchCatalogV2Detail } from "@/lib/catalog-v2-client";

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

export function ProductDetailClient({ slug }: ProductDetailClientProps) {
  const [detail, setDetail] = useState<CatalogV2DetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(slug);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) return <ProductState>Đang tải phân loại sản phẩm...</ProductState>;
  if (error) return <ProductState>{error}</ProductState>;
  if (!detail || !selectedVariant) return <ProductState>Không có dữ liệu sản phẩm</ProductState>;

  const specificationRows = [
    selectedVariant.sizeLabel ? { label: "Dung tích / khối lượng", value: selectedVariant.sizeLabel } : null,
    selectedVariant.packageLabel ? { label: "Quy cách đóng gói", value: selectedVariant.packageLabel } : null,
    selectedVariant.sellUnit ? { label: "Đơn vị bán", value: selectedVariant.sellUnit } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  function handlePrimaryVariantChange(variant: CatalogV2VariantCard) {
    setSelectedVariantId(variant.variant_id);
    window.history.replaceState(null, "", `/products/${variant.variant_id}`);
  }

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

          <h2 className="mt-4 text-[30px] font-black leading-tight tracking-tight text-[#0b1220] md:text-5xl">{detail.product.name}</h2>
          <p className="mt-3 text-sm font-black text-slate-500">Đang chọn SKU: {selectedVariant.sku}</p>

          {specificationRows.length > 0 ? (
            <div className={`mt-5 grid gap-3 ${specificationRows.length >= 3 ? "sm:grid-cols-3" : specificationRows.length === 2 ? "sm:grid-cols-2" : ""}`}>
              {specificationRows.map((item) => <InfoRow key={item.label} label={item.label} value={item.value} />)}
            </div>
          ) : (
            <p className="mt-5 rounded-[18px] bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 ring-1 ring-amber-100">
              Dung tích hoặc khối lượng chưa được xác minh từ nguồn hàng.
            </p>
          )}

          <CatalogVariantSelector
            detail={detail}
            initialVariantId={selectedVariantId}
            onPrimaryVariantChange={handlePrimaryVariantChange}
          />
        </div>
      </section>
    </div>
  );
}
