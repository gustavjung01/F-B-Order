import { RegisterShopForm } from "@/components/account/RegisterShopForm";
import { AccountGate } from "@/components/auth/AccountGate";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function RegisterPage() {
  return (
    <ResponsivePageShell active="account" title="Ho so quan" subtitle="Mo khoa gia si">
      <section className="overflow-hidden rounded-[28px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <div className="relative min-h-[132px] md:min-h-[170px]">
          <div className="relative z-10 max-w-[640px]">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Ho so quan / shop</p>
            <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Gui ho so quan de admin duyet</h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:max-w-2xl md:text-base md:leading-7">
              Tai khoan Clerk chi dung de dang nhap. Ho so quan moi la dieu kien de mo gia si, cong thuc chi tiet va dat hang.
            </p>
          </div>
          <span className="absolute bottom-2 right-3 text-[68px] drop-shadow-sm md:text-[104px]">🛍️</span>
        </div>
      </section>

      <div className="mt-4">
        <AccountGate title="Dang nhap de gui ho so quan" message="Dung popup Clerk de dang nhap hoac tao tai khoan. Dang nhap xong form ho so quan se hien ngay tai day.">
          <RegisterShopForm />
        </AccountGate>
      </div>
    </ResponsivePageShell>
  );
}
