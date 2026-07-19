"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminLink = {
  href: string;
  label: string;
  description: string;
  icon: string;
  exact?: boolean;
};

const adminLinks: readonly AdminLink[] = [
  { href: "/admin", label: "Vận hành", description: "Khách hàng và đơn hàng", icon: "⌂", exact: true },
  { href: "/admin/products", label: "Sản phẩm", description: "Catalog và trạng thái bán", icon: "▦" },
  { href: "/admin/recipes", label: "Công thức", description: "Nội dung và xuất bản", icon: "◫" },
  { href: "/admin/recipes/scale", label: "Scale", description: "Quy đổi định lượng", icon: "↗" },
];

type AdminModuleNavProps = {
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function AdminModuleNav({ orientation = "horizontal", className = "" }: AdminModuleNavProps) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  return (
    <nav
      aria-label="Điều hướng quản trị"
      className={`${vertical ? "grid gap-1" : "flex gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"} ${className}`}
    >
      {adminLinks.map((link) => {
        const active = link.exact === true ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`${vertical ? "grid grid-cols-[38px_1fr] items-center gap-3 rounded-xl px-3 py-3" : "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5"} text-sm font-black transition ${active ? "bg-orange-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
          >
            <span aria-hidden="true" className={`${vertical ? "grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-lg" : "text-base"}`}>{link.icon}</span>
            <span className="min-w-0">
              <span className="block truncate">{link.label}</span>
              {vertical ? <span className={`mt-0.5 block truncate text-[11px] font-semibold ${active ? "text-orange-50" : "text-slate-400"}`}>{link.description}</span> : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
