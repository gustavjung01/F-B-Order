"use client";

import { SignInButton, SignOutButton } from "@clerk/nextjs";
import Link from "next/link";

type AdminLoginActionsProps = {
  isSignedIn: boolean;
  email: string;
};

export function AdminLoginActions({ isSignedIn, email }: AdminLoginActionsProps) {
  return (
    <div className="mt-5 grid gap-3">
      {!isSignedIn ? (
        <SignInButton mode="modal">
          <button type="button" className="flex h-12 items-center justify-center rounded-[18px] bg-white px-5 text-[15px] font-black text-slate-950">
            Đăng nhập admin
          </button>
        </SignInButton>
      ) : (
        <>
          <div className="rounded-[18px] bg-red-500/10 p-4 text-[13px] font-bold leading-5 text-red-100 ring-1 ring-red-400/20">
            Email <span className="font-black text-white">{email}</span> đã đăng nhập nhưng chưa nằm trong ADMIN_EMAILS.
          </div>
          <SignOutButton>
            <button type="button" className="flex h-12 items-center justify-center rounded-[18px] bg-white px-5 text-[15px] font-black text-slate-950">
              Đăng xuất để dùng email admin
            </button>
          </SignOutButton>
        </>
      )}

      <Link href="/" className="flex h-12 items-center justify-center rounded-[18px] bg-white/10 px-5 text-[15px] font-black text-white ring-1 ring-white/10">
        Quay về app khách
      </Link>
    </div>
  );
}
