"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicProduct } from "@/data/catalog/product-model";

type ProductDetailResponse = {
  product: PublicProduct;
};

type ProductDetailClientProps = {
  slug: string;
};

const productEmojiByCategory: Record<string, string> = {
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
  "thuc-pham-dong-lanh": "❄️",
  "combo-cong-thuc": "📦",
  topping: "🧊",
};

function getProductEmoji(product: PublicProduct) {
  return productEmojiByCategory[product.categoryId] || productEmojiByCategory[product.subcategoryId || ""] || "📦";
}

function isUpdating(value: string | null | undefined) {
  return !value || value === "Đang cập nhật";
}

function ProductState({ children }: { children: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#e7dccd] bg-white/75 px-6 py-10 text-center text-[16px] font-black text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-[20px] bg-[#fbfaf7] px-4 py-3 ring-1 ring-[#eee7dc]">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-[15px] font-black text-[#0b1220]">{value || "Đang cập nhật"}</p>
    </div>
  );
}

export function ProductDetailClient({ slug }: ProductDetailClientProps) {
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activeRequest = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`/api/catalog/products/${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (response.status === 404) throw new Error("Không tìm thấy sản phẩm");
        if (!response.ok) throw new Error("Không tải được sản phẩm");
        const data = (await response.json()) as ProductDetailResponse;
        if (!activeRequest) return;
        setProduct(data.product);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setProduct(null);
      } finally {
        if (activeRequest) setLoading(false);
      }
    }

    loadProduct();

    return () => {
      activeRequest = false;
    };
  }, [slug]);

  if (loading) return <ProductState>Đang tải sản phẩm...</ProductState>;
  if (error) return <ProductState>{error}</ProductState>;
  if (!product) return <ProductState>Không có dữ liệu sản phẩm</ProductState>;

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">
        ← Quay lại Trang chủ
      </Link>

      <section className="grid gap-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start">
        <div className="overflow-hidden rounded-[32px] bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc]">
          <div className="grid min-h-[280px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[112px] md:min-h-[420px]">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" /> : getProductEmoji(product)}
          </div>
        </div>

        <div className="rounded-[32px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc] md:p-7">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{product.categoryName}</span>
            {product.subcategoryName ? <span className="rounded-full bg-[#fbfaf7] px-3 py-1.5 text-[12px] font-black text-slate-600 ring-1 ring-[#eee7dc]">{product.subcategoryName}</span> : null}
            {!isUpdating(product.brand) ? <span className="rounded-full bg-[#eefbf6] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{product.brand}</span> : null}
          </div>

          <h2 className="mt-4 text-[30px] font-black leading-tight tracking-tight text-[#0b1220] md:text-5xl">{product.name}</h2>
          {product.shortDescription ? <p className="mt-5 text-[15px] font-semibold leading-7 text-slate-600 md:text-base md:leading-8">{product.shortDescription}</p> : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Quy cách" value={product.packageSizeLabel} />
            <InfoRow label="Đơn vị bán" value={product.unitLabel} />
          </div>

          <div className="mt-6 rounded-[24px] bg-[#fff3ea] p-5 ring-1 ring-[#ffd0b3]">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#ff5a00]">Giá</p>
            <p className="mt-2 text-3xl font-black text-[#ff5a00]">{product.priceLabel}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Thông tin giá và quy cách còn thiếu sẽ được cập nhật sau khi đối chiếu bảng công ty.</p>
          </div>

          <div className="mt-6">
            <button type="button" disabled className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-[18px] bg-[#0b1220] px-6 text-[15px] font-black text-white opacity-95 shadow-[0_14px_26px_rgba(15,23,42,0.18)]">
              {product.orderLabel}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[30px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:p-6">
          <h3 className="text-xl font-black">Ứng dụng</h3>
          {product.useCases.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {product.useCases.map((useCase) => <span key={useCase} className="rounded-full bg-[#fbfaf7] px-3 py-2 text-sm font-bold text-slate-600 ring-1 ring-[#eee7dc]">{useCase}</span>)}
            </div>
          ) : <p className="mt-3 text-sm font-semibold text-slate-500">Đang cập nhật</p>}
        </div>

        <div className="rounded-[30px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:p-6">
          <h3 className="text-xl font-black">Điểm nổi bật</h3>
          {product.sellingPoints.length ? (
            <ul className="mt-4 space-y-2">
              {product.sellingPoints.map((point) => <li key={point} className="text-sm font-bold leading-6 text-slate-600">✓ {point}</li>)}
            </ul>
          ) : <p className="mt-3 text-sm font-semibold text-slate-500">Đang cập nhật</p>}
        </div>
      </section>
    </div>
  );
}
