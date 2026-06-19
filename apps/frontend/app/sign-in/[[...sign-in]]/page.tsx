import { SignIn } from "@clerk/nextjs";
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
        <div className="mt-6 flex justify-center md:justify-start">
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/account" fallbackRedirectUrl="/account" />
        </div>
      </section>
    </ResponsivePageShell>
  );
}
