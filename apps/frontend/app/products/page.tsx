import { ResponsivePageShell } from "@/components/responsive/ResponsivePageShell";

export default function ProductsPage() {
  return (
    <ResponsivePageShell active="products" title="Hàng" subtitle="Tính năng đang được định hình">
      <section className="rounded-[30px] border border-dashed border-[#b9eadb] bg-white/80 px-6 py-12 text-center shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-[#08775f]">Đang phát triển</p>
        <h2 className="mt-3 text-2xl font-black text-[#0b1220]">Nhánh Hàng chưa được gán chức năng chính thức</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
          Hiện tại Trang chủ là nơi xem, tìm kiếm và lọc toàn bộ sản phẩm. Nhánh Hàng được giữ riêng để phát triển thành một chức năng khác trong tương lai, nên không lặp lại catalog tại đây.
        </p>
      </section>
    </ResponsivePageShell>
  );
}
