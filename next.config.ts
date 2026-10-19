
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Lets a separate build/test run use its own output folder without
  // clobbering a running `next dev` (which uses .next).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // Use this project's root for output file tracing.
  outputFileTracingRoot: process.cwd(),

  // Permit this specific local-network address
  // to access Next.js development resources.
  // This does not apply to production.
  allowedDevOrigins: [
    "192.168.50.111",
  ],

  // Service pages that were renamed when the catalogue grew to six.
  async redirects() {
    return [
      { source: "/services/custom-development", destination: "/services/automation", permanent: true },
      { source: "/services/ui-ux-design", destination: "/services/creative", permanent: true },
    ];
  },
};

export default nextConfig;
