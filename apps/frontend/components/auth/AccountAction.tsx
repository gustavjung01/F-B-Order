"use client";

import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";

type AccountActionProps = {
  href: string;
  children: string;
  signedOutLabel?: string;
  className?: string;
};

export function AccountAction({ href, children, signedOutLabel = "Dang nhap", className = "" }: AccountActionProps) {
  const baseClass = className || "flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]";

  return (
    <>
      <SignedIn>
        <Link href={href} className={baseClass}>{children}</Link>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className={baseClass}>{signedOutLabel}</button>
        </SignInButton>
      </SignedOut>
    </>
  );
}
