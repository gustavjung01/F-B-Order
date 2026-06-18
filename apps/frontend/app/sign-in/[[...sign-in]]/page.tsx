import Link from "next/link";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function SignInPage() {
  return (
    <ResponsivePageShell active="account" title="Dang nhap" subtitle="Buoc 1">
      <section className="rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
        <span className="inline-flex rounded-full bg-[#eefbf6] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">Tai khoan dang nhap</span>
        <h1 className="mt-4 text-[28px] font-black leading-tight tracking-tight md:text-5xl">Dang nhap tai khoan</h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600 md:max-w-2xl md:text-base md:leading-7">
          Dang nhap de tao ho so quan, xem trang thai duyet va mo khoa gia si sau khi admin xac nhan.
        </p>

        <div className="mt-6 rounded-[22px] bg-[#fbfaf7] p-4 ring-1 ring-[#eee7dc] md:max-w-xl">
          <p className="text-[12px] font-black uppercase tracking-[0.14em] text-slate-500">UI tam thoi</p>
          <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-600">
            Khi gan Clerk that, khu nay se thay bang form dang nhap tai khoan.
          </p>
        </div>

        <div className="mt-6 grid gap-3 md:flex">
          <Link href="/register" className="flex h-12 items-center justify-center rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)]">Tao ho so quan</Link>
          <Link href="/sign-up" className="flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.16)]">Dang ky tai khoan</Link>
          <Link href="/" className="flex h-12 items-center justify-center rounded-[18px] bg-[#fbfaf7] px-5 text-[16px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">Xem app truoc</Link>
        </div>
      </section>
    </ResponsivePageShell>
  );
}
