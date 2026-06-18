import Link from "next/link";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { mockAuth } from "@/lib/mockAuth";
import { getApprovalLabel, getApprovalTone, mockCustomer } from "@/lib/mockCustomer";

const requiredFields = [
  { label: "Ten shop / quan", value: mockCustomer.shopName || "Chua co" },
  { label: "Nguoi lien he", value: mockCustomer.contactName || "Chua co" },
  { label: "So dien thoai", value: mockCustomer.phone || "Chua co" },
  { label: "Dia chi", value: mockCustomer.address || "Chua co" },
  { label: "Ma so thue", value: mockCustomer.taxCode || "Khong bat buoc" },
  { label: "Nganh hang", value: mockCustomer.businessType || "Chua co" },
];

export default function AccountPage() {
  const signedIn = mockAuth.isSignedIn;
  const status = mockCustomer.approvalStatus;
  const approved = status === "approved";

  return (
    <ResponsivePageShell active="account" title="Tai khoan" subtitle={signedIn ? getApprovalLabel(status) : "Chua co tai khoan"}>
      {!signedIn ? (
        <section className="overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
          <span className="inline-flex rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Buoc 1</span>
          <h1 className="mt-4 text-[28px] font-black leading-tight tracking-tight md:text-5xl">Dang ky tai khoan truoc</h1>
          <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600 md:max-w-2xl md:text-base md:leading-7">
            Tai khoan dung de dang nhap va giu danh tinh khach. Sau do moi tao ho so quan de admin duyet mo gia si.
          </p>
          <div className="mt-5 grid gap-3 md:flex">
            <Link href="/sign-up" className="flex h-12 items-center justify-center rounded-[18px] bg-[#ff5a00] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(255,90,0,0.24)]">Dang ky tai khoan</Link>
            <Link href="/sign-in" className="flex h-12 items-center justify-center rounded-[18px] bg-[#0b1220] px-5 text-[16px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.16)]">Da co tai khoan</Link>
            <Link href="/" className="flex h-12 items-center justify-center rounded-[18px] bg-[#fbfaf7] px-5 text-[16px] font-black text-[#0b1220] ring-1 ring-[#eee7dc]">Xem app truoc</Link>
          </div>
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-8">
            <span className={`inline-flex rounded-full px-3 py-1.5 text-[12px] font-black ring-1 ${getApprovalTone(status)}`}>
              {getApprovalLabel(status)}
            </span>
            <h1 className="mt-4 text-[28px] font-black leading-tight tracking-tight md:text-5xl">
              {approved ? "Da mo gia si va cong thuc" : "Da co tai khoan, ho so quan dang cho"}
            </h1>
            <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600 md:max-w-2xl md:text-base md:leading-7">
              Tai khoan va ho so quan la 2 lop rieng. Tai khoan dung de dang nhap; ho so quan dung de admin duyet mo gia si, cong thuc chi tiet va dat hang.
            </p>
          </section>

          <section className="mt-4 rounded-[28px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc] md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-black md:text-2xl">Thong tin shop</h2>
              <Link href="/register" className="rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Cap nhat</Link>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {requiredFields.map((field) => (
                <div key={field.label} className="rounded-[18px] bg-[#fbfaf7] px-4 py-3 ring-1 ring-[#eee7dc]">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{field.label}</p>
                  <p className="mt-1 text-[15px] font-black text-[#0b1220]">{field.value}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </ResponsivePageShell>
  );
}
