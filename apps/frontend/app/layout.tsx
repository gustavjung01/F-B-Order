import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const oneSignalAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "2537a634-62ab-466b-bec5-a8ff353660a8";

export const metadata: Metadata = {
  title: "Bếp Sỉ F&B",
  description: "PWA đặt hàng nguyên liệu F&B cho khách hàng.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <ClerkProvider>
          {children}
        </ClerkProvider>
        <Script src="/open-external-browser.js?v=2" strategy="afterInteractive" />
        <Script src="/pwa-install-button.js?v=2" strategy="afterInteractive" />
        <Script src="/pwa-update-toast.js?v=2" strategy="afterInteractive" />
        <Script src="/pwa-register.js?v=2" strategy="afterInteractive" />
        <Script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" strategy="afterInteractive" />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "${oneSignalAppId}",
              });
            });
          `}
        </Script>
      </body>
    </html>
  );
}
