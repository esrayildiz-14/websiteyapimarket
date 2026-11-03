import "server-only";
import { prisma } from "@/lib/prisma";

/** Ürün formu için seçenek listeleri (istemciye düz nesne olarak gider) */
export async function productFormOptions() {
  const [mains, brands, profiles] = await Promise.all([
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: "asc" },
      include: { children: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.shippingProfile.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    categories: mains.map((m) => ({
      id: m.id,
      name: m.name,
      isActive: m.isActive,
      defaultProfileId: m.defaultShippingProfileId,
      children: m.children.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive, defaultProfileId: c.defaultShippingProfileId })),
    })),
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    profiles: profiles.map((p) => ({
      id: p.id,
      code: p.code as "STD" | "AGIR" | "HACIM",
      name: p.name,
      note: `${p.transitDaysMin}–${p.transitDaysMax} iş günü${p.deliveryNote ? " · " + p.deliveryNote : ""}`,
    })),
  };
}

export type ProductFormOptions = Awaited<ReturnType<typeof productFormOptions>>;
