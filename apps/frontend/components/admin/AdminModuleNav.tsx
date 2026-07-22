"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminPermission } from "../../lib/admin-permissions";
import { useAdminPermissions } from "./AdminPermissionProvider";

const modules: Array<{
  href: string;
  label: string;
  icon: string;
  description: string;
  permissions: AdminPermission[];
}> = [
  { href: "/admin", label: "Tổng quan", icon: "▦", description: "Trung tâm vận hành", permissions: ["orders.view", "customers.view", "catalog.view", "recipes.view"] },
  { href: "/admin/orders", label: "Đơn hàng", icon: "🧾", description: "Theo dõi và xử lý đơn", permissions: ["orders.view"] },
  { href: "/admin/customers", label: "Khách sỉ", icon: "👥", description: "Hồ sơ và phê duyệt", permissions: ["customers.view"] },
  { href: "/admin/products", label: "Sản phẩm", icon: "📦", description: "Catalog, giá và trạng thái", permissions: ["catalog.view"] },
  { href: "/admin/recipes", label: "Công thức", icon: "🧋", description: "Draft, review và publish", permissions: ["recipes.view"] },
  { href: "/admin/ai", label: "Trợ lý AI", icon: "✦", description: "Query, draft và phê duyệt", permissions: ["ai.use", "ai.execute", "ai.approve", "ai.audit"] },
];

export function AdminModuleNav({
  orientation = "horizontal",
  className = "",
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const pathname = usePathname();
  const { hasAny } = useAdminPermissions();
  const visibleModules = modules.filter((item) => hasAny(item.permissions));
  const isVertical = orientation === "vertical";
  const layoutClass = isVertical
    ? "grid gap-2"
    : "flex w-full min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <nav className={`${layoutClass} ${className}`.trim()} aria-label="Điều hướng quản trị">
      {visibleModules.map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        const shapeClass = isVertical
          ? "rounded-[22px] px-4 py-3"
          : "min-h-11 shrink-0 snap-start rounded-xl px-3 py-2";

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={isVertical ? undefined : item.description}
            className={`${shapeClass} touch-manipulation border shadow-sm transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 ${
              active
                ? "border-orange-300/60 bg-orange-100 text-slate-950"
                : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50"
            }`}
          >
            <div className={`flex items-center ${isVertical ? "gap-3" : "gap-2"}`}>
              <span className={isVertical ? "text-[24px]" : "text-[18px] leading-none"} aria-hidden="true">{item.icon}</span>
              <div className="min-w-0">
                <p className={`${isVertical ? "text-[14px]" : "whitespace-nowrap text-[13px]"} font-black`}>{item.label}</p>
                {isVertical ? <p className="mt-0.5 text-[11px] font-bold text-slate-500">{item.description}</p> : null}
              </div>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
