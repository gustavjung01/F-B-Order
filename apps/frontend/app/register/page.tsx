import { RegisterShopForm } from "@/components/account/RegisterShopForm";
import { AccountGate } from "@/components/auth/AccountGate";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function RegisterPage() {
  return (
    <ResponsivePageShell active="account" title="Hồ sơ khách hàng" subtitle="Thông tin quán và quyền mua sỉ">
      <section className="overflow-hidden rounded-[28px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <div className="relative min-h-[132px] md:min-h-[170px]">
          <div className="relative z-10 max-w-[640px]">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Hồ sơ khách hàng</p>
            <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Quản lý thông tin quán</h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:max-w-2xl md:text-base md:leading-7">
              Tạo hồ sơ lần đầu hoặc cập nhật thông tin đã lưu. Hồ sơ hiện có sẽ được tự động điền.
            </p>
          </div>
          <span className="absolute bottom-2 right-3 text-[68px] drop-shadow-sm md:text-[104px]">🛍️</span>
        </div>
      </section>

      <div className="mt-4">
        <AccountGate
          title="Đăng nhập để quản lý hồ sơ quán"
          message="Đăng nhập hoặc tạo tài khoản, sau đó tạo hoặc cập nhật thông tin quán và theo dõi trạng thái xét duyệt."
        >
          <RegisterShopForm />
        </AccountGate>
      </div>
    </ResponsivePageShell>
  );
}
