export function RecipeComingSoon() {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[26px] bg-white shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
        <img src="/home/home-cong-thuc.png" alt="Công thức pha chế" className="block h-auto w-full object-contain" draggable={false} />
      </section>
      <section className="rounded-[28px] border border-dashed border-[#dccbff] bg-white/80 px-6 py-12 text-center shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-[#7c3aed]">Nội dung pha chế</p>
        <h2 className="mt-3 text-2xl font-black text-[#0b1220]">Công thức đang được cập nhật</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
          Hướng dẫn pha chế và định lượng dành cho khách hàng sẽ được cập nhật tại đây.
        </p>
      </section>
    </div>
  );
}
