"use client";

import { useEffect, useState } from "react";
import type { PublicProduct } from "@/data/catalog/product-model";
import {
  getProductDisplayPackage,
  getProductDisplayUnit,
  getProductOrderMessage,
  getProductPriceLabel,
} from "@/lib/catalog-display";
import { addCartItem } from "@/lib/cartStorage";

const emojiByCategory: Record<string, string> = {
  "tra-sua-pha-che": "🧋",
  "mi-cay-han-quoc": "🍜",
  "thuc-pham-dong-lanh": "❄️",
  "combo-cong-thuc": "📦",
  topping: "🧊",
};

function productEmoji(product: PublicProduct) {
  return emojiByCategory[product.categoryId] || emojiByCategory[product.subcategoryId || ""] || "📦";
}

export function ProductQuickView({ product, onClose }: { product: PublicProduct; onClose: () => void }) {
  const [quantity, setQuantity] = useState(product.minOrderQty);
  const [added, setAdded] = useState(false);
  const isBundle = product.productType === "bundle";

  useEffect(() => {
    setQuantity(product.minOrderQty);
  }, [product.id, product.minOrderQty]);

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

  function handleAdd() {
    if (!product.isOrderable) return;
    addCartItem({ productId: product.id, quantity });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" className="absolute inset-0 h-full w-full" onClick={onClose} />
      <section className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[86vh] max-w-md flex-col overflow-hidden rounded-t-[30px] bg-[#f7f3eb] shadow-[0_-24px_80px_rgba(15,23,42,0.28)] ring-1 ring-white/80">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between border-b border-[#eee7dc] px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">{isBundle ? "Chi tiết combo" : "Chi tiết sản phẩm"}</p>
            <p className="text-sm font-bold text-slate-500">{product.categoryName}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm ring-1 ring-[#eee7dc]">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 [-webkit-overflow-scrolling:touch]">
          <div className="grid min-h-[220px] place-items-center overflow-hidden rounded-[26px] bg-gradient-to-br from-[#fffaf3] via-[#fff3e6] to-[#ede7dd] text-[96px] ring-1 ring-white/80">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" /> : productEmoji(product)}
          </div>

          {product.brand ? <p className="mt-4 text-[11px] font-black uppercase tracking-[0.12em] text-[#ff5a00]">{product.brand}</p> : null}
          <h2 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-[#0b1220]">{product.name}</h2>
          {isBundle ? (
            <p className="mt-3 inline-flex rounded-full bg-[#f4efff] px-3 py-2 text-sm font-black text-[#7c3aed] ring-1 ring-[#dccbff]">
              {product.bundleItemCount > 0 ? `${product.bundleItemCount} sản phẩm trong combo` : "Thành phần combo đang cập nhật"}
            </p>
          ) : null}
          {product.shortDescription ? <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-600">{product.shortDescription}</p> : null}

          <div className="mt-4 grid gap-3">
            <div className="rounded-[20px] bg-white p-4 ring-1 ring-[#eee7dc]"><p className="text-xs font-black text-slate-400">Quy cách</p><p className="mt-1 font-black text-[#0b1220]">{getProductDisplayPackage(product)}</p></div>
            <div className="rounded-[20px] bg-white p-4 ring-1 ring-[#eee7dc]"><p className="text-xs font-black text-slate-400">Đơn vị bán</p><p className="mt-1 font-black text-[#0b1220]">{getProductDisplayUnit(product)}</p></div>
            <div className="rounded-[20px] bg-[#fff3ea] p-4 ring-1 ring-[#ffd0b3]"><p className="text-xs font-black text-[#ff5a00]">Giá</p><p className="mt-1 text-2xl font-black text-[#ff5a00]">{getProductPriceLabel(product)}</p></div>
          </div>

          {product.useCases.length ? <div className="mt-4"><h3 className="font-black">Ứng dụng</h3><div className="mt-2 flex flex-wrap gap-2">{product.useCases.map((item) => <span key={item} className="rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-600 ring-1 ring-[#eee7dc]">{item}</span>)}</div></div> : null}
          {product.sellingPoints.length ? <div className="mt-4"><h3 className="font-black">Điểm nổi bật</h3><ul className="mt-2 space-y-2">{product.sellingPoints.map((item) => <li key={item} className="text-sm font-bold text-slate-600">✓ {item}</li>)}</ul></div> : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-[#eee7dc] bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="grid h-12 w-32 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] text-[16px] font-black text-[#0b1220]">
              <button type="button" onClick={() => setQuantity((current) => Math.max(product.minOrderQty, current - 1))} className="bg-white active:bg-[#fff3ea]">−</button>
              <span className="grid place-items-center border-x border-[#eee7dc]">{quantity}</span>
              <button type="button" onClick={() => setQuantity((current) => current + 1)} className="bg-white active:bg-[#fff3ea]">+</button>
            </div>
            <button type="button" onClick={handleAdd} disabled={!product.isOrderable} className="h-12 flex-1 rounded-[16px] bg-[#ff5a00] px-4 text-[14px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
              {added ? "Đã thêm vào giỏ" : getProductOrderMessage(product)}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
