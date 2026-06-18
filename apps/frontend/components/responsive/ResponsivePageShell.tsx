import type { ReactNode } from "react";
import { DesktopPageShell } from "@/components/desktop/DesktopPageShell";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";

type BottomNavKey = "home" | "products" | "recipes" | "cart" | "account";

type ResponsivePageShellProps = {
  active: BottomNavKey;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function ResponsivePageShell({ active, title, subtitle, children }: ResponsivePageShellProps) {
  return (
    <>
      <div className="md:hidden">
        <MobilePageShell active={active} title={title} subtitle={subtitle}>
          {children}
        </MobilePageShell>
      </div>
      <div className="hidden md:block">
        <DesktopPageShell title={title} subtitle={subtitle}>
          {children}
        </DesktopPageShell>
      </div>
    </>
  );
}
