import Link from "next/link";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";

const fields = [
  { label: "Ten shop / quan", placeholder: "VD: Tra sua Miu Miu", required: true },
  { label: "Nguoi lien he", placeholder: "Ten chu quan / quan ly", required: true },
  { label: "So dien thoai", placeholder: "090...", required: true },
  { label: "Dia chi giao hang", placeholder: "So nha, phuong, quan, tinh/thanh", required: true },
  { label: "Ma so thue", placeholder: "Khong bat buoc", required: false },
  { label: "Nganh hang", placeholder: "Tra sua / mi cay / cafe / dai ly...", required: true },
];

export default function RegisterPage() {
  return (
    <MobilePageShell active="account" title="Mo khoa gia si" subtitle="App van xem duoc truoc">
      <section className="overflow-hidden rounded-[28px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <div className="relative min-h-[166px]">
          <div className="relative z-10 max-w-[235px]">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Ho so khach si</p>
            <h1 className="mt-3 text-[27px] font-black leading-tight tracking-tight">Dang ky de mo gia si va cong thuc</h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700">Khach van xem duoc app va catalog san pham. Ho so shop chi dung de admin mo khoa bang gia, cong thuc chi tiet va dat hang.</p>
          </div>
          <span className="absolute bottom-2 right-3 text-[84px] drop-shadow-sm">🛍️</span>
        </div>
      </section>

      <form className="mt-4 space-y-3">
        {fields.map((field) => (
          <label key={field.label} className="block rounded-[22px] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc]">
            <span className="flex items-center justify-between text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">
              {field.label}
              {field.required ? <span className="text-[#ff5a00]">Bat buoc</span> : <span className="text-slate-400">Tuy chon</span>}
            </span>
            <input className="mt-3 h-11 w-full rounded-[16px] bg-[#fbfaf7] px-4 text-[15px] font-bold text-[#0b1220] outline-none ring-1 ring-[#eee7dc] placeholder:text-slate-400 focus:ring-[#ff5a00]" placeholder={field.placeholder} />
          </label>
        ))}

        <label className="block rounded-[22px] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc]">
          <span className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">Ghi chu nhu cau nhap hang</span>
          <textarea className="mt-3 min-h-24 w-full rounded-[16px] bg-[#fbfaf7] px-4 py-3 text-[15px] font-bold text-[#0b1220] outline-none ring-1 ring-[#eee7dc] placeholder:text-slate-400 focus:ring-[#ff5a00]" placeholder="VD: Moi thang nhap topping, bot sua, ly nap..." />
        </label>

        <button type="button" className="h-12 w-full rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.26)]">
          Gui ho so mo khoa gia si
        </button>
      </form>

      <section className="mt-4 rounded-[24px] bg-white p-4 text-[14px] font-semibold leading-6 text-slate-600 shadow-[0_12px_26px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc]">
        <b className="text-[#0b1220]">Sau khi gui:</b> app van dung binh thuong. Khi admin xac nhan, shop moi thay gia si, cong thuc chi tiet va gui don.
        <div className="mt-3 flex gap-3">
          <Link href="/" className="flex-1 rounded-[16px] bg-[#fbfaf7] px-4 py-3 text-center font-black text-[#0b1220] ring-1 ring-[#eee7dc]">Ve app</Link>
          <Link href="/account" className="flex-1 rounded-[16px] bg-[#0b1220] px-4 py-3 text-center font-black text-white">Ho so</Link>
        </div>
      </section>
    </MobilePageShell>
  );
}
