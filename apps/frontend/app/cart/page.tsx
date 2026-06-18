import Link from "next/link";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { isApprovedCustomer } from "@/lib/mockCustomer";

const cartItems = [
  { name: "Tran chau den 3Q", unit: "Goi 1kg", qty: 2, price: "84.000d", icon: "🧋" },
  { name: "Bot sua Royal Auzan", unit: "Goi 1kg", qty: 1, price: "125.000d", icon: "🥛" },
];

export default function CartPage() {
  const approved = isApprovedCustomer;

  return (
    <MobilePageShell active="cart" title="Gio hang" subtitle={approved ? "Kiem tra don si" : "Can duyet truoc khi dat"}>
      {approved ? (
        <>
          <section className="rounded-[26px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Don hang tam tinh</p>
            <h1 className="mt-3 text-[26px] font-black leading-tight tracking-tight">Kiem tra so luong truoc khi gui don</h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">Nhan vien Bep Si F&B se xac nhan lai ton kho, gia va lich giao.</p>
          </section>

          <div className="mt-4 space-y-3">
            {cartItems.map((item) => (
              <article key={item.name} className="rounded-[26px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
                <div className="flex gap-3">
                  <div className="grid h-[82px] w-[86px] shrink-0 place-items-center rounded-[22px] bg-[#fff3ea] text-[46px] shadow-inner">{item.icon}</div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[18px] font-black leading-tight">{item.name}</h2>
                    <p className="mt-1 text-[13px] font-semibold text-slate-500">{item.unit}</p>
                    <p className="mt-2 text-[20px] font-black text-[#ff5a00]">{item.price}</p>
                  </div>
                </div>
                <div className="mt-4 grid h-11 grid-cols-3 overflow-hidden rounded-[16px] border border-[#eee7dc] bg-[#fbfaf7] text-[16px] font-black text-[#0b1220]">
                  <button type="button" className="bg-white">−</button>
                  <span className="grid place-items-center border-x border-[#eee7dc]">{item.qty}</span>
                  <button type="button" className="bg-white">+</button>
                </div>
              </article>
            ))}
          </div>

          <section className="mt-4 rounded-[26px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
            <div className="flex items-center justify-between text-[14px] font-bold text-slate-500">
              <span>Tam tinh</span>
              <span>209.000d</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[20px] font-black text-[#0b1220]">
              <span>Tong du kien</span>
              <span className="text-[#ff5a00]">209.000d</span>
            </div>
            <button type="button" className="mt-4 h-12 w-full rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)]">
              Gui don cho sales xac nhan
            </button>
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
          <div className="grid h-20 w-20 place-items-center rounded-[24px] bg-[#fff3ea] text-[42px] shadow-inner">🔒</div>
          <p className="mt-5 text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Gio hang dang khoa</p>
          <h1 className="mt-3 text-[27px] font-black leading-tight tracking-tight">Can duyet tai khoan si truoc khi dat hang</h1>
          <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600">App nay khong ban le. Vui long tao ho so shop, dia chi va so dien thoai de admin duyet mo bang gia.</p>
          <Link href="/register" className="mt-5 flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)]">
            Tao ho so khach si
          </Link>
        </section>
      )}
    </MobilePageShell>
  );
}
