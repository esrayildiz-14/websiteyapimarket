import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Öner Yapı Market", template: "%s – Öner Yapı Market" },
  description: "Yapı market ve hırdavat ürünleri, Türkiye geneli kargo.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers(); // her sayfa isteğe özel CSP nonce'u ile dinamik üretilir
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap"
        />
      </head>
      <body className="oy">{children}</body>
    </html>
  );
}
