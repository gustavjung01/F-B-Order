"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";
import type { ReactNode } from "react";

type AccountGateProps = {
  children: ReactNode;
  title?: string;
  message?: string;
};

export function AccountGate({
  children,
  title = "Can dang nhap tai khoan",
  message = "Dang nhap hoac tao tai khoan de tiep tuc. Sau do moi tao ho so quan de admin duyet mo gia si.",
}: AccountGateProps) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <section className="rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
          <span className="inline-flex rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Tai khoan</span>
          <h2 className="mt-4 text-[25px] font-black leading-tight tracking-tight md:text-4xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-[14px] font-semibold leading-6 text-slate-600 md:text-base md:leading-7">{message}</p>
          <div className="mt-5 grid gap-3 md:flex">
            <SignInButton mode="modal">
              <button type="button" className="flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]">
                Dang nhap
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="flex h-12 items-center justify-center rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)]">
                Tao tai khoan
              </button>
            </SignUpButton>
          </div>
        </section>
      </SignedOut>
    </>
  );
}
