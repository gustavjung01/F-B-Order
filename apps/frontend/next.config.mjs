/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const noStore = [
      {
        key: "Cache-Control",
        value: "no-store, no-cache, must-revalidate, max-age=0",
      },
    ];

    return [
      { source: "/service-worker.js", headers: noStore },
      { source: "/app-version.json", headers: noStore },
      { source: "/pwa-register.js", headers: noStore },
      { source: "/pwa-update-toast.js", headers: noStore },
      { source: "/manifest.webmanifest", headers: noStore },
    ];
  },
  async redirects() {
    return [
      {
        source: "/account",
        destination: "/register",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
