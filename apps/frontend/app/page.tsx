export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8">
      <section className="mx-auto max-w-5xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-bold uppercase text-teal-700">Bếp Sỉ F&B</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">PWA đặt hàng nguyên liệu F&B</h1>
        <p className="mt-4 text-slate-600">MVP tập trung vào sản phẩm, giỏ hàng, đơn hàng, thông báo và công thức F&B.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a className="rounded-2xl bg-teal-700 px-5 py-3 font-bold text-white" href="/products">Xem sản phẩm</a>
          <a className="rounded-2xl bg-slate-100 px-5 py-3 font-bold text-slate-900" href="/recipes">Công thức F&B</a>
        </div>
      </section>
    </main>
  );
}
