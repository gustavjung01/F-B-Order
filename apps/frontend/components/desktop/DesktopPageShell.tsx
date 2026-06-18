import type { ReactNode } from "react";
import Link from "next/link";

type DesktopPageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function DesktopPageShell({ title, subtitle, children }: DesktopPageShellProps) {
  return (
    <main className="min-h-screen bg-[#f7f3eb] text-[#0b1220]">
      <header className="sticky top-0 z-40 border-b border-[#eee7dc] bg-[#f7f3eb]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ff5a00] text-2xl font-black text-white shadow-[0_12px_24px_rgba(255,90,0,0.25)]">B</span>
            <span>
              <span className="block text-xl font-black tracking-tight">Bep Si F&B</span>
              <span className="block text-sm font-bold text-slate-500">Catalog nguyen lieu cho khach si</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 text-sm font-black text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">San pham</Link>
            <Link href="/recipes" className="rounded-full px-4 py-2 hover:bg-white">Cong thuc</Link>
            <Link href="/cart" className="rounded-full px-4 py-2 hover:bg-white">Gio hang</Link>
            <Link href="/account" className="rounded-full px-4 py-2 hover:bg-white">Tai khoan</Link>
          </nav>

          <Link href="/sign-up" className="rounded-2xl bg-[#0b1220] px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]">
            Dang ky tai khoan
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-6 rounded-[34px] bg-white p-7 shadow-[0_18px_42px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc]">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#ff5a00]">{subtitle || "Khach si F&B"}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}
