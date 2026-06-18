type AppHeaderProps = {
  title?: string;
  subtitle?: string;
};

export function AppHeader({ title = "Bep Si F&B", subtitle = "Nguon hang cho quan" }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-1 pt-1">
      <a href="/" className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-[#ff5a00] text-xl text-[#ff5a00]">▣</span>
        <span className="min-w-0">
          <strong className="block truncate text-[22px] font-black leading-tight tracking-tight text-[#0b1220]">{title}</strong>
          <span className="block truncate text-[13px] font-semibold text-slate-500">{subtitle}</span>
        </span>
      </a>
      <div className="flex shrink-0 items-center gap-4 text-[26px] text-[#0b1220]">
        <a href="/products" aria-label="Search" className="leading-none">⌕</a>
        <a href="/notifications" aria-label="Notifications" className="relative leading-none">
          ♧
          <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[#ff5a00] text-[11px] font-black text-white">3</span>
        </a>
        <a href="/account" aria-label="More" className="leading-none">◦◦</a>
      </div>
    </header>
  );
}
