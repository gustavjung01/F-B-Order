import type { ReactNode } from "react";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import { AppHeader } from "@/components/mobile/AppHeader";
import { BottomNav } from "@/components/mobile/BottomNav";
import type { AppNavKey } from "@/components/navigation/app-navigation";

type ResponsivePageShellProps = {
  active: AppNavKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function ResponsivePageShell({ active, title, subtitle, children }: ResponsivePageShellProps) {
  return (
    <main className="min-h-screen bg-[#f7f3eb] pb-28 pt-[calc(env(safe-area-inset-top)+86px)] text-[#0b1220] md:pb-0 md:pt-0">
      <div className="md:hidden">
        <AppHeader />
      </div>
      <div className="hidden md:block">
        <DesktopHeader active={active} />
      </div>

      <section className="mx-auto max-w-md px-4 py-4 md:max-w-7xl md:px-8 md:py-10">
        <div className="mb-6 hidden rounded-[34px] bg-white p-7 shadow-[0_18px_42px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:block">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#ff5a00]">{subtitle || "Khách sỉ F&B"}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
        </div>
        {children}
      </section>

      <div className="md:hidden">
        <BottomNav active={active} />
      </div>
    </main>
  );
}
