"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton, useUser } from "@clerk/nextjs";

export function ClerkAccountPanel() {
  const { user } = useUser();
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.primaryPhoneNumber?.phoneNumber || "Tai khoan";
  const contact = user?.primaryEmailAddress?.emailAddress || user?.primaryPhoneNumber?.phoneNumber || "Quan ly bao mat va dang nhap";

  return (
    <>
      <SignedIn>
        <section className="rounded-[22px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
          <div className="flex items-center gap-3">
            <div className="grid h-13 w-13 place-items-center rounded-[18px] bg-[#fff3ea] p-2 ring-1 ring-[#ffd0b3]">
              <UserButton afterSignOutUrl="/" userProfileMode="modal" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Tai khoan Clerk</p>
              <h2 className="truncate text-[20px] font-black leading-tight text-[#0b1220]">{displayName}</h2>
              <p className="mt-1 truncate text-[13px] font-bold text-slate-500">{contact}</p>
            </div>
          </div>
          <div className="mt-3 rounded-[18px] bg-[#fbfaf7] px-4 py-3 text-[13px] font-bold leading-5 text-slate-600 ring-1 ring-[#eee7dc]">
            Bam avatar de doi mat khau, email, so dien thoai, bao mat va dang xuat.
          </div>
        </section>
      </SignedIn>

      <SignedOut>
        <section className="rounded-[22px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ff5a00]">Tai khoan Clerk</p>
          <h2 className="mt-2 text-[22px] font-black leading-tight text-[#0b1220]">Dang nhap de quan ly tai khoan</h2>
          <p className="mt-2 text-[13px] font-bold leading-5 text-slate-600">Dung popup Clerk, khong can qua trang rieng. Dang nhap xong moi tao ho so quan de mo gia si.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SignInButton mode="modal">
              <button type="button" className="h-11 rounded-[16px] bg-[#0b1220] px-4 text-[14px] font-black text-white">Dang nhap</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="h-11 rounded-[16px] bg-[#ff5a00] px-4 text-[14px] font-black text-white">Tao tai khoan</button>
            </SignUpButton>
          </div>
        </section>
      </SignedOut>
    </>
  );
}
