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
    /**
     * Measured on the live site, an optimised variant was served with
     * `max-age=60`, so every image the shop displays expired after a minute
     * of inactivity and had to be re-fetched and re-encoded on the next
     * visit. On a photo-heavy category page that is the difference between a
     * page that feels instant and one that repaints its imagery each time.
     *
     * An hour is deliberate rather than "as long as possible": upload names
     * are `${Date.now()}-…` so a re-upload is a NEW url and cannot go stale,
     * but a photo that is currently MISSING comes back at the SAME url (files
     * are tracked in git, so a deploy restores them). Pinning a placeholder
     * for a year is the exact bug the old one-year /uploads header caused.
     */
    minimumCacheTTL: 3600,
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
      /**
       * Cache uploaded images in the browser.
       *
       * Left to itself, Next's static layer answers /uploads with
       * `max-age=0`, and the optimiser answered `max-age=60` — so every
       * product photo expired almost immediately and was re-downloaded on
       * every navigation. That is what made category and product pages feel
       * slow on every click instead of only the first.
       *
       * One hour, NOT the immutable year this file used to carry. Config
       * headers override the handler's own per-response header, so whatever
       * is written here also applies to the placeholder served for a missing
       * photo. A year pinned a broken image in every browser — the bug
       * documented above — whereas an hour keeps real images off the wire
       * for a normal browsing session and still lets a photo restored at the
       * same URL reappear within the hour. `must-revalidate` stops that
       * hour decaying into indefinite stale use.
       */
      {
        source: "/uploads/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
