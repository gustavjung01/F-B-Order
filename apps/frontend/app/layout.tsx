import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const oneSignalAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

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
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/account"
          signUpForceRedirectUrl="/register"
          signInFallbackRedirectUrl="/account"
          signUpFallbackRedirectUrl="/register"
        >
          {children}
        </ClerkProvider>
        <Script src="/open-external-browser.js?v=3" strategy="afterInteractive" />
        <Script src="/pwa-install-button.js?v=3" strategy="afterInteractive" />
        <Script src="/pwa-update-toast.js?v=3" strategy="afterInteractive" />
        <Script src="/pwa-register.js?v=3" strategy="afterInteractive" />
        {oneSignalAppId ? (
          <>
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
          </>
        ) : null}
      </body>
    </html>
  );
}
