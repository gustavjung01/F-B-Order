import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-5 text-[#0b1220] md:px-8 md:py-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between rounded-[28px] bg-white/80 px-4 py-3 shadow-sm ring-1 ring-[#eee7dc] md:px-6">
        <Link href="/" className="flex items-center">
          <BrandLogo className="h-12 w-auto md:h-14" />
        </Link>
        <Link href="/sign-up" className="rounded-[18px] bg-[#0b1220] px-4 py-2 text-sm font-black text-white shadow-[0_10px_20px_rgba(15,23,42,0.14)]">
          Dang ky
        </Link>
      </header>

      <section className="mx-auto mt-5 grid max-w-6xl gap-5 md:mt-8 md:grid-cols-[0.92fr_1.08fr] md:items-start">
        <div className="rounded-[32px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
          <span className="inline-flex rounded-full bg-[#eefbf6] px-3 py-1.5 text-[12px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">
            Tai khoan khach si
          </span>
          <h1 className="mt-4 text-[30px] font-black leading-tight tracking-tight md:text-5xl">
            Dang nhap Bep Si
          </h1>
          <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-600 md:text-base">
            Dang nhap de xem trang thai duyet ho so, mo gia si va tiep tuc dat hang nguyen lieu F&B.
          </p>
        </div>

        <div className="rounded-[32px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-6">
          <div className="flex justify-center">
            <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
          </div>
        </div>
      </section>
    </main>
  );
}
