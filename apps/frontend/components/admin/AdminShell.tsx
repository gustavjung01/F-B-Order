import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminModuleNav } from "@/components/admin/AdminModuleNav";
import { adminStyles } from "@/components/admin/ui/AdminUI";
import { NotificationBell } from "@/components/notifications/NotificationBell";

type AdminShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function AdminShell({ title, subtitle, children, actions }: AdminShellProps) {
  return (
    <main className={adminStyles.page}>
      <div className="mx-auto grid min-h-[100dvh] max-w-[1800px] lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen border-r border-slate-200 bg-white p-4 lg:flex lg:flex-col">
          <Link href="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-500 text-xl font-black text-white shadow-sm">B</span>
            <span>
              <span className="block text-sm font-black uppercase tracking-[0.14em] text-orange-600">Bếp Sỉ</span>
              <span className="mt-0.5 block text-xs font-bold text-slate-500">Admin operations</span>
            </span>
          </Link>

          <AdminModuleNav orientation="vertical" className="mt-5" />

          <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Phạm vi hiện tại</p>
            <p className="mt-1 text-sm font-bold leading-5 text-slate-800">Ổn định vận hành, UI và media. Không mở thêm tính năng công thức.</p>
            <Link href="/" className="mt-3 inline-flex text-sm font-black text-orange-600 hover:text-orange-700">Về trang bán hàng →</Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-[70] isolate border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 md:px-6 xl:px-8">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-600 lg:hidden">Bếp Sỉ Admin</p>
                <h1 className="truncate text-lg font-black tracking-tight text-slate-950 sm:text-xl">{title}</h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {actions}
                <NotificationBell />
                <UserButton afterSignOutUrl="/" />
              </div>
            </div>
            <div className="min-w-0 border-t border-slate-100 px-3 py-2 sm:px-4 lg:hidden">
              <AdminModuleNav className="[-webkit-overflow-scrolling:touch]" />
            </div>
          </header>

          <div className={adminStyles.content}>
            {subtitle ? (
              <div className="mb-5 flex flex-col gap-1">
                <p className="max-w-4xl text-sm font-medium leading-6 text-slate-600">{subtitle}</p>
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
