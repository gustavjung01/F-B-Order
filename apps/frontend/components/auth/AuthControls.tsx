"use client";

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  return (
    <div className="flex items-center gap-1.5 rounded-[22px] bg-white/80 p-1 shadow-sm ring-1 ring-[#eee7dc]">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="rounded-[18px] px-4 py-2 text-sm font-black text-[#0b1220] transition hover:bg-[#fbfaf7]">
            Đăng nhập
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="rounded-[18px] bg-[#0b1220] px-4 py-2 text-sm font-black text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)] transition hover:bg-[#111827]">
            Đăng ký
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" userProfileMode="modal" />
      </SignedIn>
    </div>
  );
}
