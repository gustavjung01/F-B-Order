import { RegisterShopForm } from "@/components/account/RegisterShopForm";
import { AccountGate } from "@/components/auth/AccountGate";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function RegisterPage() {
  return (
    <ResponsivePageShell active="account" title="Hồ sơ khách hàng" subtitle="Đăng ký quyền mua sỉ">
      <section className="overflow-hidden rounded-[28px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <div className="relative min-h-[132px] md:min-h-[170px]">
          <div className="relative z-10 max-w-[640px]">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Đăng ký khách hàng</p>
            <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight md:text-5xl">Gửi thông tin quán để mở quyền mua sỉ</h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:max-w-2xl md:text-base md:leading-7">
              Sau khi xác nhận thông tin, tài khoản sẽ được mở giá sỉ, công thức chi tiết và quyền đặt hàng.
            </p>
          </div>
          <span className="absolute bottom-2 right-3 text-[68px] drop-shadow-sm md:text-[104px]">🛍️</span>
        </div>
      </section>

      <div className="mt-4">
        <AccountGate
          title="Đăng nhập để đăng ký khách hàng"
          message="Đăng nhập hoặc tạo tài khoản, sau đó hoàn tất thông tin quán để được xét duyệt quyền mua sỉ."
        >
          <RegisterShopForm />
        </AccountGate>
      </div>
    </ResponsivePageShell>
  );
}
