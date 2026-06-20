"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function AppHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#eee7dc]/70 bg-[#f7f3eb]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <Link href="/" prefetch={false} aria-label="Bep Si F&B" className="flex h-[54px] w-[178px] items-center overflow-hidden">
          <img src="/brand/logo.png" alt="Bep Si F&B" className="h-[98px] w-[232px] max-w-none -translate-y-[22px] object-contain object-left mix-blend-multiply" draggable={false} />
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
