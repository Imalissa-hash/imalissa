/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Product images are stored locally in /public/uploads, except imported
    // partner products whose photos stay on the partner CDN (absolute URLs).
    remotePatterns: [
      { protocol: "https", hostname: "dropsourcebd.com" },
      { protocol: "https", hostname: "www.dropsourcebd.com" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 192, 256, 384],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // One static-generation worker: every worker opens its own Prisma pool and
    // the shared MySQL only allows 46 connections (see src/lib/db.ts).
    cpus: 1,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // NOTE: /uploads used to carry an immutable one-year Cache-Control here.
      // It was removed on purpose: config headers OVERRIDE the handler's own
      // header, so a missing photo (which the handler answers with a
      // short-lived placeholder) was pinned in every browser for a year —
      // recovering the real bytes later would have shown nothing. The handler
      // at src/app/uploads/[...path]/route.ts now sets the cache header
      // per-response: a year for a real image, minutes for a placeholder.
    ];
  },
};

export default nextConfig;
