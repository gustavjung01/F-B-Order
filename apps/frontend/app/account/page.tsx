import Link from "next/link";
import { SignedIn } from "@clerk/nextjs";
import { ClerkAccountPanel } from "@/components/auth/ClerkAccountPanel";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";
import { getApprovalLabel, getApprovalTone, mockCustomer } from "@/lib/mockCustomer";

const shopFields = [
  { label: "Shop / quan", value: mockCustomer.shopName || "Chua co" },
  { label: "Lien he", value: mockCustomer.contactName || "Chua co" },
  { label: "Dien thoai", value: mockCustomer.phone || "Chua co" },
  { label: "Dia chi", value: mockCustomer.address || "Chua co" },
  { label: "MST", value: mockCustomer.taxCode || "Khong bat buoc" },
  { label: "Nganh", value: mockCustomer.businessType || "Chua co" },
];

export default function AccountPage() {
  const status = mockCustomer.approvalStatus;
  const approved = status === "approved";

  return (
    <ResponsivePageShell active="account" title="Tai khoan" subtitle="Quan ly dang nhap va ho so">
      <div className="space-y-3 md:space-y-4">
        <ClerkAccountPanel />

        <SignedIn>
          <section className="rounded-[22px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1.5 text-[12px] font-black ring-1 ${getApprovalTone(status)}`}>
                  {getApprovalLabel(status)}
                </span>
                <h1 className="mt-3 text-[22px] font-black leading-tight text-[#0b1220] md:text-3xl">
                  {approved ? "Da mo khoa gia si" : "Ho so quan dang cho duyet"}
                </h1>
                <p className="mt-2 text-[13px] font-bold leading-5 text-slate-600 md:text-sm">
                  Gia si, cong thuc chi tiet va dat hang chi mo sau khi admin duyet ho so quan.
                </p>
              </div>
              <Link href="/register" className="shrink-0 rounded-[16px] bg-[#fff3ea] px-3 py-2 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">
                Cap nhat
              </Link>
            </div>
          </section>

          <section className="rounded-[22px] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#efe7dc]">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-black text-[#0b1220]">Ho so shop</h2>
              <Link href="/register" className="text-[13px] font-black text-[#ff5a00]">Sua</Link>
            </div>
            <div className="mt-3 divide-y divide-[#eee7dc] rounded-[18px] border border-[#eee7dc] bg-[#fbfaf7]">
              {shopFields.map((field) => (
                <div key={field.label} className="grid grid-cols-[108px_1fr] gap-3 px-4 py-3 md:grid-cols-[150px_1fr]">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{field.label}</p>
                  <p className="text-right text-[14px] font-black text-[#0b1220] md:text-left md:text-[15px]">{field.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[22px] bg-[#0b1220] p-4 text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-200">Nhan vien phu trach</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-black">{mockCustomer.salesOwner}</h2>
                <p className="mt-1 text-[13px] font-bold leading-5 text-slate-300">
                  {approved ? "Co the gui don de sales xac nhan." : "Sales se xac minh truoc khi mo gia."}
                </p>
              </div>
              <Link href="/" className="shrink-0 rounded-[16px] bg-white px-4 py-3 text-[13px] font-black text-[#0b1220]">
                Xem hang
              </Link>
            </div>
          </section>
        </SignedIn>
      </div>
    </ResponsivePageShell>
  );
}
