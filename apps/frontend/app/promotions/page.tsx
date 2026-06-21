import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function PromotionsPage() {
  return (
    <ResponsivePageShell active="promotions" title="Khuyến mãi" subtitle="Ưu đãi của công ty">
      <section className="rounded-[30px] border border-dashed border-[#ffc9c3] bg-white/80 px-6 py-12 text-center shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-[#dc2626]">Đang phát triển</p>
        <h2 className="mt-3 text-2xl font-black text-[#0b1220]">Chưa có chương trình khuyến mãi</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
          Trang này sẽ hiển thị các chương trình giảm giá và ưu đãi chính thức của công ty.
        </p>
      </section>
    </ResponsivePageShell>
  );
}
