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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#eee7dc] bg-white/96 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-10px_26px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <a key={item.key} href={item.href} className={`relative flex h-[58px] flex-col items-center justify-center gap-1 rounded-[18px] text-[10px] font-extrabold transition ${isActive ? "bg-[#fff3ea] text-[#ff5a00]" : "text-slate-500"}`}>
              <span className="relative text-[24px] leading-none">
                {item.icon}
                {item.badge ? <span className="absolute -right-3 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[#ff5a00] text-[11px] font-black text-white">{item.badge}</span> : null}
              </span>
              <span className="leading-none">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
