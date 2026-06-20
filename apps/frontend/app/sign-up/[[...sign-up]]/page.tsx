import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-[#f7f3eb] px-4 py-5 text-[#0b1220] md:px-8 md:py-8">
      <header className="mx-auto flex max-w-6xl items-center justify-between rounded-[28px] bg-white/80 px-4 py-3 shadow-sm ring-1 ring-[#eee7dc] md:px-6">
        <Link href="/" className="flex items-center">
          <BrandLogo className="h-12 w-auto md:h-14" />
        </Link>
        <Link href="/sign-in" className="rounded-[18px] bg-white px-4 py-2 text-sm font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]">
          Đăng nhập
        </Link>
      </header>

      <section className="mx-auto mt-5 grid max-w-6xl gap-5 md:mt-8 md:grid-cols-[0.92fr_1.08fr] md:items-start">
        <div className="rounded-[32px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
          <span className="inline-flex rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">
            Tạo tài khoản
          </span>
          <h1 className="mt-4 text-[30px] font-black leading-tight tracking-tight md:text-5xl">
            Đăng ký Bếp Sỉ
          </h1>
          <p className="mt-3 text-[15px] font-semibold leading-7 text-slate-600 md:text-base">
            Tạo tài khoản đăng nhập trước. Sau đó hệ thống sẽ đưa bạn sang bước tạo hồ sơ quán để admin duyệt mở giá sỉ.
          </p>
          <div className="mt-5 rounded-[24px] bg-[#fbfaf7] p-4 text-sm font-bold leading-6 text-slate-600 ring-1 ring-[#eee7dc]">
            Đã có tài khoản? Bấm Đăng nhập ở góc trên để vào lại tài khoản hiện có.
          </div>
        </div>

        <div className="rounded-[32px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-6">
          <div className="flex justify-center">
            <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
          </div>
        </div>
      </section>
    </main>
  );
}
