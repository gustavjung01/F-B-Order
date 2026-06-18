"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
};

export function AppHeader({ title = "Bep Si F&B", subtitle = "Nguon hang cho quan" }: AppHeaderProps) {
  const lastY = useRef(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      if (y < 24) {
        setHidden(false);
      } else if (y > lastY.current + 12) {
        setHidden(true);
      } else if (y < lastY.current - 12) {
        setHidden(false);
      }
      lastY.current = y;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b border-[#eee7dc]/70 bg-[#f7f3eb]/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl transition-transform duration-300 will-change-transform ${hidden ? "-translate-y-full" : "translate-y-0"}`}>
      <div className="mx-auto flex max-w-md items-center justify-between gap-4">
        <Link href="/" prefetch className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-11 w-11 shrink-0" />
          <span className="min-w-0">
            <strong className="block truncate text-[20px] font-black leading-tight tracking-tight text-[#0b1220]">{title}</strong>
            <span className="block truncate text-[12px] font-semibold text-slate-500">{subtitle}</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/" prefetch aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[20px] text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">⌕</Link>
          <Link href="/notifications" prefetch aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-[19px] text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
            ♧
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#ff5a00] text-[11px] font-black text-white">3</span>
          </Link>
          <Link href="/account" prefetch aria-label="More" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[18px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">•••</Link>
        </div>
      </div>
    </header>
  );
}
