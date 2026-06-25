"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandBadge } from "@/components/catalog/BrandBadge";
import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import {
  getCatalogV2PriceLabel,
  getCatalogV2SpecificationLabel,
  getCatalogV2VariantCountLabel,
} from "@/lib/catalog-v2-display";
import { getBrandVisual } from "@/lib/brand-visuals";

function categoryEmoji(id: string) {
  const value = id.toLowerCase();
  if (value.includes("tra") || value.includes("pha-che")) return "🧋";
  if (value.includes("topping")) return "🧊";
  if (value.includes("bot")) return "🥛";
  if (value.includes("syrup") || value.includes("mut")) return "🍓";
  if (value.includes("dung-cu")) return "🥄";
  return "📦";
}

function PackageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 7 4-7 4-7-4 7-4Zm7 4v8l-7 4-7-4V7m7 4v8" />
    </svg>
  );
}

function OpenTarget({
  href,
  onOpen,
  className,
  children,
  ariaLabel,
}: {
  href?: string;
  onOpen?: () => void;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  if (href) return <Link href={href} className={className} aria-label={ariaLabel}>{children}</Link>;
  return <button type="button" onClick={onOpen} className={className} aria-label={ariaLabel}>{children}</button>;
}

export function CompactProductCard({
  product,
  href,
  onOpen,
  desktop = false,
}: {
  product: CatalogV2VariantCard;
  href?: string;
  onOpen?: () => void;
  desktop?: boolean;
}) {
  const brandVisual = getBrandVisual(product.brand);

  return (
    <article
      className={`flex min-w-0 flex-col overflow-hidden bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-[#eee7dc] ${desktop ? "rounded-[26px]" : "rounded-[22px]"}`}
      style={{ borderTop: `3px solid ${brandVisual.accent}` }}
    >
      <OpenTarget
        href={href}
        onOpen={onOpen}
        ariaLabel={`Mở ${product.name}`}
        className={`relative grid w-full place-items-center overflow-hidden text-center ${desktop ? "h-48 p-4 text-6xl" : "h-[132px] p-3 text-[44px]"}`}
      >
        <BrandBadge brand={product.brand} compact={!desktop} className="absolute right-2 top-2 z-10 max-w-[78%] shadow-sm" />
        {product.image.url ? (
          <img src={product.image.url} alt={product.name} className="h-full w-full object-contain pt-4" />
        ) : categoryEmoji(product.industryKey)}
      </OpenTarget>

      <div className={`flex flex-1 flex-col ${desktop ? "p-4 pt-3" : "p-3 pt-2.5"}`}>
        <OpenTarget
          href={href}
          onOpen={onOpen}
          className={`block w-full text-left font-black leading-[1.18] tracking-tight text-[#0b1220] hover:text-[#ff5a00] ${desktop ? "min-h-[48px] text-lg" : "min-h-[38px] text-[15px]"}`}
        >
          <span className="line-clamp-2">{product.name}</span>
        </OpenTarget>

        <p className={`mt-2 flex min-w-0 items-center gap-1.5 font-bold leading-tight text-slate-500 ${desktop ? "text-xs" : "text-[11px]"}`}>
          <PackageIcon />
          <span className="truncate">{getCatalogV2SpecificationLabel(product)}</span>
        </p>

        <p className={`mt-3 font-black leading-tight text-[#f05213] ${desktop ? "text-lg" : "text-[14px]"}`}>
          {getCatalogV2PriceLabel(product)}
        </p>

        <OpenTarget
          href={href}
          onOpen={onOpen}
          className={`mt-3 flex w-full items-center justify-between rounded-[14px] bg-[#fff7f1] px-3 font-black text-[#0b1220] ring-1 ring-[#f5dfd1] active:scale-[0.99] ${desktop ? "min-h-11 text-sm" : "min-h-10 text-[11px]"}`}
        >
          <span>{getCatalogV2VariantCountLabel(product)}</span>
          <span className="text-lg leading-none text-[#f05213]">→</span>
        </OpenTarget>
      </div>
    </article>
  );
}
