/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'deckofcardsapi.com',
        pathname: '/static/img/**',
      },
    ],
  },
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;

