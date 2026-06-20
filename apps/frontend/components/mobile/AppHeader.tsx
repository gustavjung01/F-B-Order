"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand/BrandMark";

type AppHeaderProps = {
  title?: string;
  subtitle?: string;
};

export function AppHeader({ title = "Bep Si F&B", subtitle = "Nguon hang cho quan" }: AppHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#eee7dc]/70 bg-[#f7f3eb]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-between gap-4">
        <Link href="/" prefetch={false} className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-11 w-auto max-w-[128px] shrink-0" />
          <span className="min-w-0">
            <strong className="block truncate text-[20px] font-black leading-tight tracking-tight text-[#0b1220]">{title}</strong>
            <span className="block truncate text-[12px] font-semibold text-slate-500">{subtitle}</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/" prefetch={false} aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[15px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">Tim</Link>
          <SignedIn>
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-[#eee7dc]">
              <UserButton afterSignOutUrl="/" userProfileMode="modal" />
            </div>
          </SignedIn>
          <SignedOut>
            <Link href="/sign-in" prefetch={false} aria-label="Account" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[11px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
              TK
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}
