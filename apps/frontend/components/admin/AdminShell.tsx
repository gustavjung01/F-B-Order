import Link from "next/link";
import type { ReactNode } from "react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const adminLinks = [
  { href: "/admin/orders", label: "Đơn hàng", icon: "📦" },
  { href: "/admin/customers", label: "Khách sỉ", icon: "🏪" },
  { href: "/admin/products", label: "Duyệt quán", icon: "🏬" },
  { href: "/admin/recipes", label: "Công thức", icon: "🍜" },
  { href: "/admin/recipes/scale", label: "Scale công thức", icon: "📐" },
];

type AdminShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AdminShell({ title, subtitle, children }: AdminShellProps) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-10 pt-[calc(env(safe-area-inset-top)+18px)] text-white md:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href="/admin/orders" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-[0_10px_24px_rgba(249,115,22,0.22)]">
                <span>âš™</span>
                <span>Báº¿p Sá»‰ Admin</span>
              </Link>
              <h1 className="mt-4 text-[28px] font-black leading-tight tracking-tight md:text-5xl">{title}</h1>
              {subtitle ? <p className="mt-2 max-w-2xl text-[14px] font-bold leading-6 text-slate-300 md:text-base">{subtitle}</p> : null}
            </div>
            <NotificationBell />
            <nav className="flex gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {adminLinks.map((link) => (
                <Link key={link.href} href={link.href} className="inline-flex shrink-0 items-center gap-2 rounded-[16px] bg-white px-4 py-3 text-[13px] font-black text-slate-950 shadow-[0_12px_26px_rgba(0,0,0,0.16)] ring-1 ring-white/70 active:translate-y-px">
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <div className="mt-5">
          {children}
        </div>
      </section>
    </main>
  );
}


