"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
};

export function AppHeader({ title = "Bep Si", subtitle = "F&B" }: AppHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#eee7dc] bg-[#f7f3eb] px-4 py-3">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <Link href="/" prefetch={false} className="min-w-0">
          <strong className="block truncate text-[18px] font-black text-[#0b1220]">{title}</strong>
          <span className="block truncate text-[12px] font-semibold text-slate-500">{subtitle}</span>
        </Link>
        <SignedIn>
          <UserButton afterSignOutUrl="/" userProfileMode="modal" />
        </SignedIn>
        <SignedOut>
          <Link href="/sign-in" prefetch={false} className="rounded-full bg-white px-4 py-2 text-[12px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
            Login
          </Link>
        </SignedOut>
      </div>
    </header>
  );
}
