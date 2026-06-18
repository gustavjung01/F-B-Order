import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bếp Sỉ F&B",
  description: "PWA đặt hàng nguyên liệu F&B cho khách hàng.",
  manifest: "/manifest.webmanifest",
  themeColor: "#0f766e",
  appleWebApp: {
    capable: true,
    title: "Bếp Sỉ F&B",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
