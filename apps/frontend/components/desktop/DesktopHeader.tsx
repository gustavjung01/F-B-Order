import Link from "next/link";
import { AuthControls } from "@/components/auth/AuthControls";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { APP_NAV_ITEMS, type AppNavKey } from "@/components/navigation/app-navigation";

export function DesktopHeader({ active }: { active: AppNavKey }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#eee7dc] bg-[#f7f3eb]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-3">
        <Link href="/" className="flex h-12 w-[190px] items-center overflow-visible" aria-label="Bếp Sỉ F&B">
          <BrandLogo className="h-12 w-[190px] origin-left scale-[1.08] object-left" />
        </Link>

        <nav className="flex items-center gap-2 text-sm font-black text-slate-600">
          {APP_NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-full px-4 py-2 transition ${isActive ? "bg-white text-[#ff5a00] shadow-sm" : "hover:bg-white"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <AuthControls />
      </div>
    </header>
  );
}
