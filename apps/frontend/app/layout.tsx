import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import Script from "next/script";
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

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Script src="/open-external-browser.js?v=1" strategy="afterInteractive" />
        <Script src="/pwa-install-button.js?v=1" strategy="afterInteractive" />
        <Script src="/pwa-update-toast.js?v=1" strategy="afterInteractive" />
        <Script src="/pwa-register.js?v=1" strategy="afterInteractive" />
      </body>
    </html>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <AppShell>{children}</AppShell>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <AppShell>{children}</AppShell>
    </ClerkProvider>
  );
}
