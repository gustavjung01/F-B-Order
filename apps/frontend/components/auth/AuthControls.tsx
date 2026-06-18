"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
            Dang nhap
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="rounded-2xl bg-[#0b1220] px-4 py-2 text-sm font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]">
            Dang ky tai khoan
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}
