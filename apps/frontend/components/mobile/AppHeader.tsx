"use client";

import { useEffect, useRef, useState } from "react";

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
      } else if (y > lastY.current + 8) {
        setHidden(true);
      } else if (y < lastY.current - 8) {
        setHidden(false);
      }
      lastY.current = y;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b border-[#eee7dc]/70 bg-[#f7f3eb]/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl transition-transform duration-300 ${hidden ? "-translate-y-full" : "translate-y-0"}`}>
      <div className="mx-auto flex max-w-md items-center justify-between gap-4">
        <a href="/" className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-[#fff4e9] ring-2 ring-[#ff5a00]/25">
            <span className="absolute -top-1.5 h-3 w-5 rounded-t-lg border-2 border-[#ff5a00] border-b-0" />
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#ff5a00] text-[15px] font-black text-white">B</span>
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-[20px] font-black leading-tight tracking-tight text-[#0b1220]">{title}</strong>
            <span className="block truncate text-[12px] font-semibold text-slate-500">{subtitle}</span>
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-2">
          <a href="/products" aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[20px] text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">⌕</a>
          <a href="/notifications" aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-[19px] text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
            ♧
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#ff5a00] text-[11px] font-black text-white">3</span>
          </a>
          <a href="/account" aria-label="More" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[18px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">•••</a>
        </div>
      </div>
    </header>
  );
}
