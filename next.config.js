/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo-safe when multiple lockfiles exist in subfolders.
  turbopack: {
    root: process.cwd(),
  },
};

module.exports = nextConfig;
