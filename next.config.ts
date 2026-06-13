import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev and production build to separate directories (via NEXT_DIST_DIR) so a
  // running production server's build is never clobbered by `next dev` or a
  // verification `next build`. Production uses the default ".next".
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
