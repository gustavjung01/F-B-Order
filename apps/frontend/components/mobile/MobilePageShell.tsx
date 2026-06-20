import type { ReactNode } from "react";
import { AppHeader } from "@/components/mobile/AppHeader";
import { BottomNav } from "@/components/mobile/BottomNav";

type BottomNavKey = "home" | "products" | "recipes" | "cart" | "account";

type MobilePageShellProps = {
  active: BottomNavKey;
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export function MobilePageShell({ active, children }: MobilePageShellProps) {
  return (
    <main className="min-h-screen bg-[#f7f3eb] pb-28 pt-[calc(env(safe-area-inset-top)+86px)] text-[#0b1220]">
      <AppHeader />
      <section className="mx-auto max-w-md px-4 py-4">
        {children}
      </section>
      <BottomNav active={active} />
    </main>
  );
}
