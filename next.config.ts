import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Testler ayrı bir derleme klasörü kullanır; geliştirme sunucusuyla çakışmaz.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Ürün formu birden fazla görseli (her biri en fazla 5 MB) tek seferde gönderir.
    serverActions: { bodySizeLimit: "26mb" },
  },
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "exceljs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
