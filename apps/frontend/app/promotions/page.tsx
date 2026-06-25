import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function PromotionsPage() {
  return (
    <ResponsivePageShell active="promotions" title="Khuyến mãi" subtitle="Ưu đãi dành cho khách hàng">
      <section className="rounded-[30px] border border-dashed border-[#ffc9c3] bg-white/80 px-6 py-12 text-center shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-[#dc2626]">Thông tin ưu đãi</p>
        <h2 className="mt-3 text-2xl font-black text-[#0b1220]">Chưa có chương trình đang áp dụng</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
          Các chương trình khuyến mãi mới sẽ được cập nhật tại đây.
        </p>
      </section>
    </ResponsivePageShell>
  );
}
