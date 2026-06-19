"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AuthControls() {
  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <Link href="/sign-in" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
          Dang nhap
        </Link>
        <Link href="/sign-up" className="rounded-2xl bg-[#0b1220] px-4 py-2 text-sm font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]">
          Dang ky tai khoan
        </Link>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}
