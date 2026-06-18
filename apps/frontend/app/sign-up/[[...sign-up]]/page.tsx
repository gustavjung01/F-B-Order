import { SignUp } from "@clerk/nextjs";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function SignUpPage() {
  return (
    <ResponsivePageShell active="account" title="Dang ky tai khoan" subtitle="Buoc 1">
      <section className="rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
        <span className="inline-flex rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Tai khoan dang nhap</span>
        <h1 className="mt-4 text-[28px] font-black leading-tight tracking-tight md:text-5xl">Tao tai khoan truoc</h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600 md:max-w-2xl md:text-base md:leading-7">
          Buoc nay dung de tao danh tinh dang nhap. Sau khi co tai khoan, khach moi tao ho so quan de admin duyet mo gia si.
        </p>
        <div className="mt-6 flex justify-center md:justify-start">
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/register" />
        </div>
      </section>
    </ResponsivePageShell>
  );
}
