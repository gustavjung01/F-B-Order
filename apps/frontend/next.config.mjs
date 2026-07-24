const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/service-worker.js",
        headers: [
          ...noStoreHeaders,
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      { source: "/app-version.json", headers: noStoreHeaders },
      { source: "/manifest.webmanifest", headers: noStoreHeaders },
      { source: "/pwa-register.js", headers: noStoreHeaders },
      { source: "/pwa-install-button.js", headers: noStoreHeaders },
      { source: "/open-external-browser.js", headers: noStoreHeaders },
    ];
  },
};

export default nextConfig;
