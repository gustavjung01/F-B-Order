import Link from "next/link";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { accountFirstMessage, mockAuth } from "@/lib/mockAuth";

const fields = [
  { label: "Ten shop / quan", placeholder: "VD: Tra sua Miu Miu", required: true },
  { label: "Nguoi lien he", placeholder: "Ten chu quan / quan ly", required: true },
  { label: "So dien thoai", placeholder: "090...", required: true },
  { label: "Dia chi giao hang", placeholder: "So nha, phuong, quan, tinh/thanh", required: true },
  { label: "Ma so thue", placeholder: "Khong bat buoc", required: false },
  { label: "Nganh hang", placeholder: "Tra sua / mi cay / cafe / dai ly...", required: true },
];

export default function RegisterPage() {
  const signedIn = mockAuth.isSignedIn;

  return (
    <ResponsivePageShell active="account" title="Dang ky ho so quan" subtitle="Buoc 2 sau tai khoan">
      <section className="overflow-hidden rounded-[28px] bg-[#fff1d7] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80 md:p-8">
        <div className="relative min-h-[166px] md:min-h-[190px]">
          <div className="relative z-10 max-w-[640px]">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">Ho so quan / shop</p>
            <h1 className="mt-3 text-[27px] font-black leading-tight tracking-tight md:text-5xl">Dang ky quan de mo gia si va cong thuc</h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-700 md:max-w-2xl md:text-base md:leading-7">
              Tai khoan dang nhap la buoc 1. Sau khi co tai khoan, khach moi gui ho so quan de admin duyet mo khoa gia, cong thuc chi tiet va dat hang.
            </p>
          </div>
          <span className="absolute bottom-2 right-3 text-[84px] drop-shadow-sm md:text-[116px]">🛍️</span>
        </div>
      </section>

      {!signedIn ? (
        <section className="mt-4 rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-7">
          <span className="inline-flex rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Can tai khoan truoc</span>
          <h2 className="mt-4 text-[24px] font-black leading-tight tracking-tight md:text-3xl">Chua the gui ho so quan</h2>
          <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600 md:text-base md:leading-7">{accountFirstMessage}</p>
          <div className="mt-5 grid gap-3 md:flex">
            <Link href="/sign-up" className="flex h-12 items-center justify-center rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)]">
              Dang ky tai khoan
            </Link>
            <Link href="/sign-in" className="flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.16)]">
              Dang nhap
            </Link>
            <Link href="/" className="flex h-12 items-center justify-center rounded-[18px] bg-[#fbfaf7] px-5 text-[16px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">
              Xem app truoc
            </Link>
          </div>
        </section>
      ) : (
        <form className="mt-4 grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.label} className="block rounded-[22px] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc]">
              <span className="flex items-center justify-between text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">
                {field.label}
                {field.required ? <span className="text-[#ff5a00]">Bat buoc</span> : <span className="text-slate-400">Tuy chon</span>}
              </span>
              <input className="mt-3 h-11 w-full rounded-[16px] bg-[#fbfaf7] px-4 text-[15px] font-bold text-[#0b1220] outline-none ring-1 ring-[#eee7dc] placeholder:text-slate-400 focus:ring-[#ff5a00]" placeholder={field.placeholder} />
            </label>
          ))}

          <label className="block rounded-[22px] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:col-span-2">
            <span className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">Ghi chu nhu cau nhap hang</span>
            <textarea className="mt-3 min-h-24 w-full rounded-[16px] bg-[#fbfaf7] px-4 py-3 text-[15px] font-bold text-[#0b1220] outline-none ring-1 ring-[#eee7dc] placeholder:text-slate-400 focus:ring-[#ff5a00]" placeholder="VD: Moi thang nhap topping, bot sua, ly nap..." />
          </label>

          <button type="button" className="h-12 rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.26)] md:col-span-2">
            Gui ho so quan cho admin duyet
          </button>
        </form>
      )}

      <section className="mt-4 rounded-[24px] bg-white p-4 text-[14px] font-semibold leading-6 text-slate-600 shadow-[0_12px_26px_rgba(15,23,42,0.075)] ring-1 ring-[#efe7dc] md:p-5 md:text-base md:leading-7">
        <b className="text-[#0b1220]">Dung luong dung:</b> tai khoan Clerk dung de dang nhap. Ho so quan dung de admin duyet mo gia si.
      </section>
    </ResponsivePageShell>
  );
}
