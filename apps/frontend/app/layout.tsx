import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { OneSignalBootstrap } from "@/components/notifications/OneSignalBootstrap";
import "./globals.css";

const oneSignalAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const oneSignalEnabled = process.env.NEXT_PUBLIC_ENABLE_ONESIGNAL === "true" && Boolean(oneSignalAppId?.trim());
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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

function ClerkConfigGuard({ children }: { children: React.ReactNode }) {
  if (clerkPublishableKey) return <>{children}</>;

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Missing Clerk configuration</h1>
      <p>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not configured for this deployment.</p>
    </main>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <ClerkConfigGuard>
          <ClerkProvider
            publishableKey={clerkPublishableKey}
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
          >
            {children}
          </ClerkProvider>
        </ClerkConfigGuard>
        <Script id="runtime-flags" strategy="beforeInteractive">
          {`
            window.__FB_ORDER_RUNTIME__ = {
              enableOneSignal: ${oneSignalEnabled ? "true" : "false"}
            };
          `}
        </Script>
        <Script src="/open-external-browser.js?v=4" strategy="afterInteractive" />
        <Script src="/pwa-install-button.js?v=6" strategy="afterInteractive" />
        <Script src="/pwa-update-toast.js?v=6" strategy="afterInteractive" />
        <Script src="/pwa-register.js?v=6" strategy="afterInteractive" />
        {oneSignalEnabled ? <OneSignalBootstrap appId={oneSignalAppId ?? ""} enabled={oneSignalEnabled} /> : null}
      </body>
    </html>
  );
}
