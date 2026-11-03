import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Yalnız yayındaki ürünler, aktif kategoriler ve yayındaki sayfalar. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [cats, products, pages] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] }, select: { slug: true, updatedAt: true } }),
    prisma.product.findMany({
      where: { status: "ACTIVE", deletedAt: null, category: { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] } },
      select: { slug: true, updatedAt: true },
      take: 45000,
    }),
    prisma.page.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true, type: true, legalApproved: true } }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/urunler`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/sss`, changeFrequency: "monthly", priority: 0.3 },
    ...cats.map((c) => ({ url: `${base}/kategori/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: `${base}/urun/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...pages.filter((p) => p.type !== "LEGAL" || p.legalApproved).map((p) => ({ url: `${base}/sayfa/${p.slug}`, lastModified: p.updatedAt, priority: 0.3 })),
  ];
}
