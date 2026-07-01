/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 15.5+ truncates request bodies at 10 MB when middleware/proxy is used.
  // Intro Reel videos up to 150 MB must pass through /api/facebook/* intact.
  experimental: {
    proxyClientMaxBodySize: '160mb',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
  },
  // Monorepo-safe: pin Turbopack root when multiple lockfiles exist.
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'xxrealit.cz' }],
        destination: 'https://www.xxrealit.cz/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/videos/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
