import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // Canlı ortam dışında (SITE_URL tanımlı değilse) tüm site dizine kapalıdır.
  if (!process.env.SITE_URL) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/sepet", "/odeme", "/hesabim", "/giris", "/siparis", "/siparis-takip", "/arama"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
