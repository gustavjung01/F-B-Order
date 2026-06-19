"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AccountAction } from "@/components/auth/AccountAction";
import { addCartItem } from "@/lib/cartStorage";

type RelatedProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  imageUrl: string;
  minOrderQty: number;
  categoryName: string;
  categorySlug: string;
  price: number | null;
  publicPriceHint?: string | null;
};

type ProductImage = {
  id: string;
  imageUrl: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
};

type ProductDetail = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  description: string;
  shortDescription: string;
  unit: string;
  packageSpec: string;
  packageSize: string;
  origin: string;
  imageUrl: string;
  images: ProductImage[];
  minOrderQty: number;
  useCases: string[];
  sellingPoints: string[];
  categoryName: string;
  categorySlug: string;
  subcategoryName: string;
  subcategorySlug: string;
  price: number | null;
  publicPriceHint?: string | null;
  relatedProducts: RelatedProduct[];
};

type ProductDetailResponse = {
  approved: boolean;
  product: ProductDetail;
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

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function getProductEmoji(product: ProductDetail | RelatedProduct) {
  return productEmojiByCategory[product.categorySlug] || "📦";
}

function ProductState({ children }: { children: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#e7dccd] bg-white/75 px-6 py-10 text-center text-[16px] font-black text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

function RelatedCard({ product, approved }: { product: RelatedProduct; approved: boolean }) {
  return (
    <Link href={`/products/${product.slug}`} className="block rounded-[24px] bg-white p-4 shadow-[0_14px_30px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc]">
      <div className="grid h-28 place-items-center overflow-hidden rounded-[20px] bg-[#fff3ea] text-5xl">
        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : getProductEmoji(product)}
      </div>
      {product.brand ? <p className="mt-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{product.brand}</p> : null}
      <h3 className="mt-1 line-clamp-2 min-h-10 text-[15px] font-black leading-tight text-[#0b1220]">{product.name}</h3>
      <p className="mt-2 text-[13px] font-bold text-slate-500">{product.categoryName}</p>
      {approved && typeof product.price === "number" ? <p className="mt-3 text-lg font-black text-[#ff5a00]">{formatVnd(product.price)}</p> : <p className="mt-3 inline-flex rounded-full bg-[#fff3ea] px-3 py-1.5 text-xs font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Giá sỉ sau duyệt</p>}
    </Link>
  );
}

export function ProductDetailClient({ slug }: ProductDetailClientProps) {
  const [approved, setApproved] = useState(false);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let activeRequest = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`/api/products/${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (response.status === 404) throw new Error("Không tìm thấy sản phẩm");
        if (!response.ok) throw new Error("Không tải được sản phẩm");
        const data = (await response.json()) as ProductDetailResponse;
        if (!activeRequest) return;
        setApproved(Boolean(data.approved));
        setProduct(data.product);
        setQuantity(Math.max(1, data.product.minOrderQty || 1));
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

  const primaryImageUrl = useMemo(() => {
    if (!product) return "";
    return product.images.find((image) => image.isPrimary)?.imageUrl || product.images[0]?.imageUrl || product.imageUrl || "";
  }, [product]);

  if (loading) return <ProductState>Đang tải sản phẩm...</ProductState>;
  if (error) return <ProductState>{error}</ProductState>;
  if (!product) return <ProductState>Không có dữ liệu sản phẩm</ProductState>;

  const currentProduct: ProductDetail = product;
  const price = currentProduct.price;
  const hasPrice = typeof price === "number";
  const minQty = Math.max(1, currentProduct.minOrderQty || 1);
  const packageLabel = currentProduct.packageSize || currentProduct.packageSpec || currentProduct.unit;
  const description = currentProduct.shortDescription || currentProduct.description;

  function handleAddToCart() {
    if (typeof currentProduct.price !== "number") return;
    const unitPrice = currentProduct.price;

    addCartItem({
      productId: currentProduct.id,
      sku: currentProduct.sku,
      name: currentProduct.name,
      unit: currentProduct.unit || packageLabel || "sản phẩm",
      price: unitPrice,
      quantity,
      minOrderQty: minQty,
      imageUrl: primaryImageUrl,
      categorySlug: currentProduct.categorySlug,
    });

    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start">
        <div className="overflow-hidden rounded-[32px] bg-white p-4 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc]">
          <div className="grid min-h-[280px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[112px] md:min-h-[420px]">
            {primaryImageUrl ? <img src={primaryImageUrl} alt={currentProduct.name} className="h-full w-full object-contain" /> : getProductEmoji(currentProduct)}
          </div>
        </div>

        <div className="rounded-[32px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.085)] ring-1 ring-[#efe7dc] md:p-7">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">{currentProduct.categoryName}</span>
            {currentProduct.subcategoryName ? <span className="rounded-full bg-[#fbfaf7] px-3 py-1.5 text-[12px] font-black text-slate-600 ring-1 ring-[#eee7dc]">{currentProduct.subcategoryName}</span> : null}
            {currentProduct.brand ? <span className="rounded-full bg-[#eefbf6] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{currentProduct.brand}</span> : null}
          </div>

          <h2 className="mt-4 text-[30px] font-black leading-tight tracking-tight text-[#0b1220] md:text-5xl">{currentProduct.name}</h2>
          <p className="mt-3 text-[15px] font-bold text-slate-500 md:text-base">SKU: {currentProduct.sku}</p>
          {packageLabel ? <p className="mt-2 text-[15px] font-bold text-slate-500 md:text-base">Quy cách: {packageLabel}</p> : null}
          {currentProduct.origin ? <p className="mt-2 text-[15px] font-bold text-slate-500 md:text-base">Xuất xứ: {currentProduct.origin}</p> : null}
          {description ? <p className="mt-5 text-[15px] font-semibold leading-7 text-slate-600 md:text-base md:leading-8">{description}</p> : null}

          {hasPrice ? (
            <div className="mt-6 rounded-[24px] bg-[#fff3ea] p-5 ring-1 ring-[#ffd0b3]">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#ff5a00]">Giá khách sỉ</p>
              <p className="mt-2 text-4xl font-black text-[#ff5a00]">{formatVnd(price)}</p>
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] bg-[#fff3ea] p-5 ring-1 ring-[#ffd0b3]">
              <p className="text-[15px] font-black text-[#ff5a00]">{currentProduct.publicPriceHint || "Giá sỉ sau duyệt"}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Đăng nhập và tạo hồ sơ quán để admin mở bảng giá sỉ cho tài khoản của bạn.</p>
            </div>
          )}

          {hasPrice ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <div className="grid h-12 grid-cols-3 overflow-hidden rounded-[18px] border border-[#eee7dc] bg-[#fbfaf7] text-[17px] font-black text-[#0b1220] sm:w-44">
                <button type="button" aria-label={`Giảm ${currentProduct.name}`} onClick={() => setQuantity((current) => Math.max(minQty, current - 1))} className="bg-white active:bg-[#fff3ea]">−</button>
                <span className="grid place-items-center border-x border-[#eee7dc] bg-[#fbfaf7]">{quantity}</span>
                <button type="button" aria-label={`Tăng ${currentProduct.name}`} onClick={() => setQuantity((current) => current + 1)} className="bg-white active:bg-[#fff3ea]">+</button>
              </div>
              <button type="button" onClick={handleAddToCart} className={`h-12 flex-1 rounded-[18px] px-6 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(255,90,0,0.24)] ring-1 active:translate-y-px ${added ? "bg-[#08775f] ring-[#0b8f72]/40" : "bg-[#ff5a00] ring-[#ff7a2e]/40"}`}>
                {added ? "Đã thêm vào giỏ" : "Thêm vào giỏ"}
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <AccountAction href="/register" signedOutLabel="Tạo hồ sơ để mở giá" className="flex h-12 w-full items-center justify-center rounded-[18px] bg-[#0b1220] px-6 text-[15px] font-black text-white shadow-[0_14px_26px_rgba(15,23,42,0.18)]">Tạo hồ sơ để mở giá</AccountAction>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[30px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:p-6">
          <h3 className="text-xl font-black">Ứng dụng</h3>
          {currentProduct.useCases.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {currentProduct.useCases.map((useCase) => <span key={useCase} className="rounded-full bg-[#fbfaf7] px-3 py-2 text-sm font-bold text-slate-600 ring-1 ring-[#eee7dc]">{useCase}</span>)}
            </div>
          ) : <p className="mt-3 text-sm font-semibold text-slate-500">Chưa có ứng dụng chi tiết.</p>}
        </div>

        <div className="rounded-[30px] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:p-6">
          <h3 className="text-xl font-black">Điểm bán hàng</h3>
          {currentProduct.sellingPoints.length ? (
            <ul className="mt-4 space-y-2">
              {currentProduct.sellingPoints.map((point) => <li key={point} className="text-sm font-bold leading-6 text-slate-600">✓ {point}</li>)}
            </ul>
          ) : <p className="mt-3 text-sm font-semibold text-slate-500">Chưa có điểm bán hàng chi tiết.</p>}
        </div>
      </section>

      {currentProduct.relatedProducts.length ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-black">Sản phẩm liên quan</h3>
            <Link href="/products" className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Xem tất cả</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {currentProduct.relatedProducts.map((related) => <RelatedCard key={related.id || related.sku} product={related} approved={approved} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
