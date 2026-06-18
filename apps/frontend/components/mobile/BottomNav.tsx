const items = [
  { href: "/", label: "Trang chu", icon: "⌂", key: "home" },
  { href: "/products", label: "San pham", icon: "▦", key: "products" },
  { href: "/recipes", label: "Cong thuc", icon: "♨", key: "recipes" },
  { href: "/cart", label: "Gio hang", icon: "♧", key: "cart", badge: "2" },
  { href: "/account", label: "Tai khoan", icon: "♙", key: "account" },
];

type BottomNavProps = {
  active: "home" | "products" | "recipes" | "cart" | "account";
};

export function BottomNav({ active }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#eee7dc] bg-white/95 px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <a key={item.key} href={item.href} className={`relative flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-bold ${isActive ? "text-[#ff5a00]" : "text-slate-500"}`}>
              <span className="relative text-[26px] leading-none">
                {item.icon}
                {item.badge ? <span className="absolute -right-3 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[#ff5a00] text-[11px] font-black text-white">{item.badge}</span> : null}
              </span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
