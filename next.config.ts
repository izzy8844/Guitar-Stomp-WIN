import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Electron — generates pure HTML/JS/CSS in `out/`
  output: "export",

  // Fix: prevent Turbopack from scanning parent directory as workspace root
  turbopack: {
    root: import.meta.dirname,
  },

  // Static export doesn't support image optimization
  images: {
    unoptimized: true,
  },

  // Ensure each route gets its own directory with index.html for clean URLs
  trailingSlash: true,
};

export default nextConfig;
