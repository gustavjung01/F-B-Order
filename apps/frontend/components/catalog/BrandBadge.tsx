"use client";

import type { CSSProperties } from "react";
import { getBrandVisual, type BrandIconName } from "@/lib/brand-visuals";

function BrandIcon({ icon }: { icon: BrandIconName }) {
  if (icon === "drop") {
    return <path d="M12 3.5c2.7 3.1 4 5.5 4 7.2a4 4 0 1 1-8 0c0-1.7 1.3-4.1 4-7.2Z" />;
  }
  if (icon === "leaf") {
    return <path d="M18 5c-6.2.2-10 2.7-10 7.2 0 2.5 1.8 4.3 4.4 4.3 4.4 0 5.5-5.1 5.6-11.5ZM6 18c2.2-4 5-6.7 9.1-8.4" />;
  }
  if (icon === "crown") {
    return <path d="m5 8 3.2 2.4L12 5l3.8 5.4L19 8l-1.4 9H6.4L5 8Zm2 9h10" />;
  }
  if (icon === "cube") {
    return <path d="m12 3 7 4-7 4-7-4 7-4Zm7 4v8l-7 4-7-4V7m7 4v8" />;
  }
  if (icon === "wave") {
    return <path d="M4 9c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2M4 14c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2" />;
  }
  return <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />;
}

export function BrandMark({ brand, size = 24 }: { brand: string | null | undefined; size?: number }) {
  const visual = getBrandVisual(brand);
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        color: visual.foreground,
        backgroundColor: visual.background,
        boxShadow: `inset 0 0 0 1px ${visual.border}`,
      }}
    >
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <BrandIcon icon={visual.icon} />
      </svg>
    </span>
  );
}

export function BrandBadge({
  brand,
  compact = false,
  className = "",
}: {
  brand: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const visual = getBrandVisual(brand);
  const style: CSSProperties = {
    color: visual.foreground,
    backgroundColor: visual.background,
    boxShadow: `inset 0 0 0 1px ${visual.border}`,
  };

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full font-black uppercase tracking-[0.08em] ${compact ? "gap-1 px-2 py-1 text-[8px]" : "gap-1.5 px-2.5 py-1.5 text-[10px]"} ${className}`}
      style={style}
      title={visual.label}
    >
      <BrandMark brand={brand} size={compact ? 16 : 20} />
      <span className="truncate">{visual.label}</span>
    </span>
  );
}

export function BrandFilterOption({
  brand,
  count,
  selected,
  onToggle,
}: {
  brand: string;
  count: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const visual = getBrandVisual(brand);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className="flex min-h-11 items-center gap-2 rounded-[14px] px-3 py-2 text-left transition active:scale-[0.99]"
      style={{
        color: selected ? visual.foreground : "#334155",
        backgroundColor: selected ? visual.background : "#ffffff",
        boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? visual.accent : "#e7dccd"}`,
      }}
    >
      <BrandMark brand={brand} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black">{brand}</span>
        <span className="mt-0.5 block text-[10px] font-bold text-slate-400">{count} sản phẩm</span>
      </span>
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-black"
        style={{
          color: selected ? "#ffffff" : "#94a3b8",
          backgroundColor: selected ? visual.accent : "#f8fafc",
          boxShadow: `inset 0 0 0 1px ${selected ? visual.accent : "#cbd5e1"}`,
        }}
      >
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}
