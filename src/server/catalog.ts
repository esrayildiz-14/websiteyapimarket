import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePrice, type DiscountRule } from "@/lib/pricing";
import { stockState } from "./inventory";

/** Müşteri tarafında görünen ürünler: yalnız ACTIVE ve silinmemiş */
export const VISIBLE = {
  status: "ACTIVE" as const,
  deletedAt: null,
  // kategori ve (varsa) üst kategorisi aktif olmalı
  category: { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] },
};

export async function activeDiscounts(): Promise<DiscountRule[]> {
  const now = new Date();
  const rows = await prisma.discount.findMany({ where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } } });
  return rows.map((d) => ({
    type: d.type,
    value: Number(d.value),
    target: d.target,
    targetId: d.targetId,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    isActive: d.isActive,
  }));
}

/** Ana kategori ise kendisi + alt kategorileri; alt kategori ise yalnız kendisi */
export async function categoryWithDescendants(slug: string) {
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    include: {
      parent: true,
      children: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!category) return null;
  return { category, ids: [category.id, ...category.children.map((c) => c.id)] };
}

export async function listCategoryProducts(categoryIds: string[] | null, opts: { sort?: string; take?: number; q?: string } = {}) {
  const orderBy =
    opts.sort === "fiyat-artan" ? { price: "asc" as const }
    : opts.sort === "fiyat-azalan" ? { price: "desc" as const }
    : opts.sort === "yeni" ? { createdAt: "desc" as const }
    : { soldCount: "desc" as const };
  const [products, rules] = await Promise.all([
    prisma.product.findMany({
      where: {
        ...VISIBLE,
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: "insensitive" as const } },
                { sku: { contains: opts.q.toUpperCase() } },
                { barcode: opts.q },
                { brand: { name: { contains: opts.q, mode: "insensitive" as const } } },
                { model: { contains: opts.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        brand: true,
        category: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        shippingProfile: true,
        inventory: true,
      },
      orderBy: [orderBy, { id: "asc" }],
      take: opts.take ?? 48,
    }),
    activeDiscounts(),
  ]);
  return products.map((p) => toCard(p, rules));
}

type CardSource = {
  id: string; name: string; slug: string; sku: string; price: unknown; salePrice: unknown; freeShipping?: boolean;
  inventory: { quantity: number; reserved: number; minStock: number } | null;
  categoryId: string; brandId: string | null; saleUnit: string;
  brand: { name: string } | null; category: { parentId: string | null }; images: { url: string; alt: string | null }[];
  shippingProfile: { code: string; name: string };
};

export function toCard(p: CardSource, rules: DiscountRule[]) {
  const available = Math.max(0, (p.inventory?.quantity ?? 0) - (p.inventory?.reserved ?? 0));
  const ep = effectivePrice(
    {
      id: p.id,
      price: Number(p.price),
      salePrice: p.salePrice === null ? null : Number(p.salePrice),
      categoryId: p.categoryId,
      categoryParentId: p.category.parentId,
      brandId: p.brandId,
    },
    rules,
  );
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    brand: p.brand?.name ?? null,
    image: p.images[0]?.url ?? null,
    imageAlt: p.images[0]?.alt ?? p.name,
    price: ep.price,
    listPrice: ep.listPrice,
    discounted: ep.discounted,
    stock: available,
    stockState: stockState(available, p.inventory?.minStock ?? 0),
    freeShipping: !!p.freeShipping,
    saleUnit: p.saleUnit,
    shipping: p.shippingProfile.code,
  };
}

export type ProductCardData = ReturnType<typeof toCard>;
