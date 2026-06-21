import type { ReactNode } from "react";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import type { AppNavKey } from "@/components/navigation/app-navigation";

type DesktopPageShellProps = {
  active: AppNavKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function DesktopPageShell({ active, title, subtitle, children }: DesktopPageShellProps) {
  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <DesktopHeader active={active} />

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-6 rounded-[34px] bg-white p-7 shadow-[0_18px_42px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc]">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#ff5a00]">{subtitle || "Khách sỉ F&B"}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}
