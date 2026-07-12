"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminLinks = [
  { href: "/admin", label: "Vận hành", icon: "⚙️", exact: true },
  { href: "/admin/products", label: "Sản phẩm", icon: "🏬" },
  { href: "/admin/recipes", label: "Công thức", icon: "🍜" },
  { href: "/admin/recipes/scale", label: "Scale công thức", icon: "📐" },
] as const;

type AdminModuleNavProps = {
  variant?: "light" | "dark";
  className?: string;
};

export function AdminModuleNav({ variant = "light", className = "" }: AdminModuleNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Điều hướng quản trị"
      className={`flex gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {adminLinks.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        const baseClass = "inline-flex shrink-0 items-center gap-2 rounded-[16px] px-4 py-3 text-[13px] font-black transition active:translate-y-px";
        const toneClass = variant === "dark"
          ? active
            ? "bg-orange-500 text-white shadow-[0_12px_26px_rgba(249,115,22,0.25)]"
            : "bg-white text-slate-950 shadow-[0_12px_26px_rgba(0,0,0,0.16)] ring-1 ring-white/70"
          : active
            ? "bg-slate-950 text-white shadow-sm"
            : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:text-slate-950";

        return (
          <Link key={link.href} href={link.href} className={`${baseClass} ${toneClass}`}>
            <span aria-hidden="true">{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
