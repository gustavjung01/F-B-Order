export type AppNavKey = "home" | "goods" | "recipes" | "cart" | "account";

export type AppNavItem = {
  key: AppNavKey;
  href: string;
  label: string;
  icon: string;
  tone: string;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { href: "/", label: "Trang chủ", icon: "⌂", key: "home", tone: "text-[#ff5a00] bg-[#fff3ea]" },
  { href: "/goods", label: "Hàng", icon: "▦", key: "goods", tone: "text-[#08775f] bg-[#eefbf6]" },
  { href: "/recipes", label: "Công thức", icon: "♨", key: "recipes", tone: "text-[#7c3aed] bg-[#f4efff]" },
  { href: "/cart", label: "Giỏ hàng", icon: "♧", key: "cart", tone: "text-[#2563eb] bg-[#eef6ff]" },
  { href: "/register", label: "Tài khoản", icon: "♙", key: "account", tone: "text-[#b77900] bg-[#fff8e8]" },
];
