import Link from "next/link";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
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
  const status = mockCustomer.approvalStatus;
  const approved = status === "approved";

  return (
    <MobilePageShell active="account" title="Tai khoan" subtitle={approved ? "Da mo khoa gia si" : "Dang cho mo khoa"}>
      <section className="overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
        <span className={`inline-flex rounded-full px-3 py-1.5 text-[12px] font-black ring-1 ${getApprovalTone(status)}`}>
          {getApprovalLabel(status)}
        </span>
        <h1 className="mt-4 text-[28px] font-black leading-tight tracking-tight">
          {approved ? "Da mo gia si va cong thuc" : "App van dung duoc, gia dang khoa"}
        </h1>
        <p className="mt-3 text-[14px] font-semibold leading-6 text-slate-600">
          Khach co the xem app va catalog san pham. Ho so shop chi dung de mo khoa gia si, cong thuc chi tiet va tinh nang dat hang.
        </p>
      </section>

      <section className="mt-4 rounded-[28px] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.095)] ring-1 ring-[#efe7dc]">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-black">Thong tin shop</h2>
          <Link href="/register" className="rounded-full bg-[#fff3ea] px-3 py-1.5 text-[12px] font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">Cap nhat</Link>
        </div>
        <div className="mt-4 space-y-2">
          {requiredFields.map((field) => (
            <div key={field.label} className="rounded-[18px] bg-[#fbfaf7] px-4 py-3 ring-1 ring-[#eee7dc]">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{field.label}</p>
              <p className="mt-1 text-[15px] font-black text-[#0b1220]">{field.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[28px] bg-[#0b1220] p-5 text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-orange-200">Nhan vien phu trach</p>
        <h2 className="mt-3 text-[24px] font-black">{mockCustomer.salesOwner}</h2>
        <p className="mt-2 text-[14px] font-semibold leading-6 text-slate-300">
          {approved ? "Co the gui don truc tiep de sales xac nhan." : "Sales se lien he xac minh truoc khi admin mo gia va cong thuc."}
        </p>
      </section>
    </MobilePageShell>
  );
}
