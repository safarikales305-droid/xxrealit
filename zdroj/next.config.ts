import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Monorepo: pin Turbopack root when multiple lockfiles exist (e.g. repo root + zdroj). */
  turbopack: {
    root: process.cwd(),
  },
  /** Ensure `public/videos/*` is served as static assets (default); add caching. */
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

export default nextConfig;
