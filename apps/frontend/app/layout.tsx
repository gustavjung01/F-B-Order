import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const oneSignalAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const oneSignalEnabled = process.env.NEXT_PUBLIC_ENABLE_ONESIGNAL === "true" && Boolean(oneSignalAppId);
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "Bếp Sỉ F&B",
  description: "Web đặt hàng nguyên liệu F&B cho khách hàng.",
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
        <Script src="/open-external-browser.js?v=4" strategy="afterInteractive" />
        {oneSignalEnabled ? (
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
