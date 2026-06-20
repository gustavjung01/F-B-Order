"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AuthControls() {
  return (
    <div className="flex items-center gap-1.5 rounded-[22px] bg-white/80 p-1 shadow-sm ring-1 ring-[#eee7dc]">
      <SignedOut>
        <Link href="/sign-in" className="rounded-[18px] bg-[#0b1220] px-4 py-2 text-sm font-black text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)] transition hover:bg-[#111827]">
          Dang nhap
        </Link>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" userProfileMode="modal" />
      </SignedIn>
    </div>
  );
}
