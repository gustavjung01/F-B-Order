import Link from "next/link";

const items = [
  { href: "/", label: "Trang chu", icon: "⌂", key: "home" },
  { href: "/", label: "Hang", icon: "▦", key: "products" },
  { href: "/recipes", label: "Cong thuc", icon: "♨", key: "recipes" },
  { href: "/cart", label: "Gio hang", icon: "♧", key: "cart" },
  { href: "/account", label: "Tai khoan", icon: "♙", key: "account" },
];

type BottomNavProps = {
  active: "home" | "products" | "recipes" | "cart" | "account";
};

export function BottomNav({ active }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#eee7dc] bg-white/96 px-3 pb-[calc(env(safe-area-inset-bottom)+5px)] pt-1.5 shadow-[0_-8px_22px_rgba(15,23,42,0.09)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <Link key={item.key} href={item.href} prefetch className={`relative flex h-[50px] flex-col items-center justify-center gap-0.5 rounded-[16px] text-[9.5px] font-extrabold transition ${isActive ? "bg-[#fff3ea] text-[#ff5a00]" : "text-slate-500"}`}>
              <span className="relative text-[21px] leading-none">{item.icon}</span>
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
