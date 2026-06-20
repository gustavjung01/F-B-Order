"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function AppHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#eee7dc]/70 bg-[#f7f3eb]/95 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <Link href="/" prefetch={false} aria-label="Bep Si F&B" className="flex h-11 w-[160px] items-center">
          <BrandLogo className="h-11 w-[160px] object-left" />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/" prefetch={false} aria-label="Search" className="grid h-9 w-9 place-items-center rounded-full bg-white text-[12px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">Tim</Link>
          <SignedIn>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm ring-1 ring-[#eee7dc]">
              <UserButton afterSignOutUrl="/" userProfileMode="modal" />
            </div>
          </SignedIn>
          <SignedOut>
            <Link href="/sign-in" prefetch={false} aria-label="Account" className="grid h-9 w-9 place-items-center rounded-full bg-white text-[11px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
              TK
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}
