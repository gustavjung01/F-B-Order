/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
