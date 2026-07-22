"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminPermissions } from "./AdminPermissionProvider";
import type { AdminPermission } from "../../lib/admin-permissions";

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
  { href: "/admin/ai", label: "Trợ lý AI", icon: "✦", description: "Query, draft và phê duyệt", permissions: ["ai.use", "ai.execute", "ai.audit"] },
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
  const layoutClass = orientation === "vertical" ? "grid gap-2" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-6";

  return (
    <nav className={`${layoutClass} ${className}`.trim()} aria-label="Điều hướng quản trị">
      {visibleModules.map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-[22px] border px-4 py-3 transition ${
              active
                ? "border-orange-300/40 bg-orange-400/15 text-slate-950"
                : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-[24px]" aria-hidden="true">{item.icon}</span>
              <div>
                <p className="text-[14px] font-black">{item.label}</p>
                <p className="mt-0.5 text-[11px] font-bold text-slate-500">{item.description}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
