import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";
import { getSettings } from "@/lib/settings";

export default async function robots(): Promise<MetadataRoute.Robots> {
  let sitemapPath = "/sitemap.xml";
  try {
    const settings = await getSettings();
    // Honour an admin-configured robots directive if present (e.g. noindex during launch).
    const directive = settings.seo.robots.trim();
    if (directive.toLowerCase().includes("noindex")) {
      return {
        rules: [{ userAgent: "*", disallow: "/" }],
        sitemap: absoluteUrl(sitemapPath),
      };
    }
  } catch {
    /* fall through to default allow */
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/account", "/checkout", "/cart", "/auth/"],
      },
    ],
    sitemap: absoluteUrl(sitemapPath),
  };
}
