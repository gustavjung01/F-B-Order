import { AdminCustomersPanel } from "@/components/admin/AdminCustomersPanel";
import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export const dynamic = "force-dynamic";

export default function AdminCustomersPage() {
  return (
    <ResponsivePageShell active="account" title="Admin" subtitle="Duyet khach si">
      <section className="mb-4 rounded-[28px] bg-[#0b1220] p-5 text-white shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-orange-200">Quan ly khach si</p>
        <h1 className="mt-3 text-[28px] font-black leading-tight">Duyet ho so quan</h1>
        <p className="mt-2 text-[14px] font-bold leading-6 text-slate-300">Khach duoc duyet moi xem gia si, cong thuc chi tiet va gui don.</p>
      </section>
      <AdminCustomersPanel />
    </ResponsivePageShell>
  );
}
