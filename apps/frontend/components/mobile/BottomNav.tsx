import Link from "next/link";

const items = [
  { href: "/", label: "Trang chủ", icon: "⌂", key: "home", tone: "text-[#ff5a00] bg-[#fff3ea]" },
  { href: "/", label: "Hàng", icon: "▦", key: "products", tone: "text-[#08775f] bg-[#eefbf6]" },
  { href: "/recipes", label: "Công thức", icon: "♨", key: "recipes", tone: "text-[#7c3aed] bg-[#f4efff]" },
  { href: "/cart", label: "Giỏ hàng", icon: "♧", key: "cart", tone: "text-[#2563eb] bg-[#eef6ff]" },
  { href: "/register", label: "Tài khoản", icon: "♙", key: "account", tone: "text-[#b77900] bg-[#fff8e8]" },
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
            <Link key={item.key} href={item.href} prefetch className={`relative flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-[16px] text-[9.5px] font-extrabold transition ${isActive ? "bg-[#fff3ea] text-[#ff5a00]" : "text-slate-500"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none ${item.tone}`}>{item.icon}</span>
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
