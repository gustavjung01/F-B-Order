"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import Link from "next/link";

type AccountActionProps = {
  href: string;
  children: string;
  signedOutLabel?: string;
  signedOutHref?: string;
  className?: string;
};

export function AccountAction({ href, children, signedOutLabel = "Dang nhap", signedOutHref = "/sign-in", className = "" }: AccountActionProps) {
  const baseClass = className || "flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]";

  return (
    <>
      <SignedIn>
        <Link href={href} className={baseClass}>{children}</Link>
      </SignedIn>
      <SignedOut>
        <Link href={signedOutHref} className={baseClass}>{signedOutLabel}</Link>
      </SignedOut>
    </>
  );
}
