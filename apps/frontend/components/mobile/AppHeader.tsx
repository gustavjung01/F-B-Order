"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function AppHeader() {
  const [hidden, setHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    function updateHeader() {
      const currentScrollY = Math.max(0, window.scrollY);
      const previousScrollY = lastScrollYRef.current;
      const delta = currentScrollY - previousScrollY;

      if (currentScrollY < 40) {
        setHidden(false);
      } else if (delta > 8 && currentScrollY > 90) {
        setHidden(true);
      } else if (delta < -8) {
        setHidden(false);
      }

      lastScrollYRef.current = currentScrollY;
      tickingRef.current = false;
    }

    function handleScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      window.requestAnimationFrame(updateHeader);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-40 border-b border-[#eee7dc]/70 bg-[#f7f3eb]/95 px-3 pb-1.5 pt-[calc(env(safe-area-inset-top)+6px)] backdrop-blur-xl transition-transform duration-200 ease-out will-change-transform ${hidden ? "-translate-y-full" : "translate-y-0"}`}>
      <div className="mx-auto flex max-w-md items-center justify-between gap-1.5">
        <Link href="/" prefetch={false} aria-label="Bếp Sỉ F&B" className="block h-[48px] w-[194px] min-[375px]:w-[204px] min-[390px]:w-[210px] shrink-0 overflow-hidden rounded-[10px]">
          <span
            className="block h-full w-full"
            style={{
              backgroundImage: "url('/brand/logo.png')",
              backgroundRepeat: "no-repeat",
              backgroundSize: "204px 84px",
              backgroundPosition: "left -18px",
              mixBlendMode: "multiply",
            }}
          />
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <NotificationBell compact />
          <SignedIn>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm ring-1 ring-[#eee7dc]">
              <UserButton afterSignOutUrl="/" userProfileMode="modal" />
            </div>
          </SignedIn>
          <SignedOut>
            <Link href="/sign-in" prefetch={false} aria-label="Tài khoản" className="grid h-9 w-9 place-items-center rounded-full bg-white text-[11px] font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
              TK
            </Link>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}
