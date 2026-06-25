"use client";

export function CatalogHero({
  searchText,
  onSearchChange,
}: {
  searchText: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="relative min-h-[220px] overflow-hidden rounded-[30px] shadow-[0_14px_30px_rgba(15,23,42,0.085)] ring-1 ring-white/80">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero/home.png')" }} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,247,237,0.22)_44%,rgba(247,243,235,0.90)_100%)]" />
      <div className="relative z-10 min-h-[220px] p-4">
        <div className="absolute inset-x-4 top-[48%] -translate-y-1/2 text-center">
          <h2 className="mx-auto inline-block whitespace-nowrap text-[clamp(22px,6.7vw,30px)] font-black leading-none tracking-[-0.045em] text-[#0b1220]">Nguyên liệu F&B cho quán</h2>
        </div>
        <input
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Tìm tên, thương hiệu hoặc mã sản phẩm..."
          className="absolute bottom-4 left-4 right-4 h-12 rounded-[18px] border border-white/80 bg-white/95 px-4 text-[15px] font-bold shadow-sm outline-none placeholder:text-slate-400 focus:border-[#ff5a00] focus:bg-white"
        />
      </div>
    </div>
  );
}
