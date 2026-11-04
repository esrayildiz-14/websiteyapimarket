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

export type ListOptions = {
  sort?: string; q?: string; page?: number; perPage?: number;
  brandIds?: string[]; minPrice?: number | null; maxPrice?: number | null; inStock?: boolean;
  take?: number; // eski çağrılar için: sayfalamasız ilk N ürün
};

function searchWhere(q: string | undefined) {
  return q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { sku: { contains: q.toUpperCase() } },
          { barcode: q },
          { brand: { name: { contains: q, mode: "insensitive" as const } } },
          { model: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
}

/**
 * Ürün listesi: filtre (marka, fiyat aralığı, stokta olanlar), sıralama ve sayfalama.
 * Fiyat filtresi ve sıralaması müşterinin gördüğü GEÇERLİ fiyata göre yapılır (indirimli fiyat ve kampanyalar dahil).
 * Önce eşleşen ürünlerin yalnız fiyat/stok alanları çekilir, sıralanır; sonra yalnız istenen sayfanın ayrıntıları yüklenir.
 */
export async function listProducts(categoryIds: string[] | null, opts: ListOptions = {}) {
  const where = { ...VISIBLE, ...(categoryIds ? { categoryId: { in: categoryIds } } : {}), ...searchWhere(opts.q) };
  const [slim, rules] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true, price: true, salePrice: true, categoryId: true, brandId: true, soldCount: true, createdAt: true,
        category: { select: { parentId: true } }, brand: { select: { id: true, name: true } }, inventory: { select: { quantity: true, reserved: true } },
      },
    }),
    activeDiscounts(),
  ]);
  const rows = slim.map((p) => ({
    ...p,
    eff: effectivePrice(
      { id: p.id, price: Number(p.price), salePrice: p.salePrice === null ? null : Number(p.salePrice), categoryId: p.categoryId, categoryParentId: p.category.parentId, brandId: p.brandId },
      rules,
    ).price,
    avail: Math.max(0, (p.inventory?.quantity ?? 0) - (p.inventory?.reserved ?? 0)),
  }));
  // marka seçenekleri: diğer filtrelerden bağımsız, bu listede bulunan markalar
  const brandMap = new Map<string, { id: string; name: string; count: number }>();
  for (const r of rows) if (r.brand) brandMap.set(r.brand.id, { ...r.brand, count: (brandMap.get(r.brand.id)?.count ?? 0) + 1 });
  const brands = [...brandMap.values()].sort((x, y) => x.name.localeCompare(y.name, "tr"));
  const priceRange = rows.length ? { min: Math.min(...rows.map((r) => r.eff)), max: Math.max(...rows.map((r) => r.eff)) } : null;

  const filtered = rows.filter(
    (r) =>
      (!opts.brandIds?.length || (r.brandId !== null && opts.brandIds.includes(r.brandId))) &&
      (opts.minPrice == null || r.eff >= opts.minPrice) &&
      (opts.maxPrice == null || r.eff <= opts.maxPrice) &&
      (!opts.inStock || r.avail > 0),
  );
  const cmp: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    "fiyat-artan": (a, b) => a.eff - b.eff,
    "fiyat-azalan": (a, b) => b.eff - a.eff,
    yeni: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    "": (a, b) => b.soldCount - a.soldCount,
  };
  const sorter = cmp[opts.sort ?? ""] ?? cmp[""];
  filtered.sort((a, b) => sorter(a, b) || a.id.localeCompare(b.id));

  const perPage = opts.take ?? Math.min(96, Math.max(1, opts.perPage ?? 24));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = opts.take ? 1 : Math.min(pages, Math.max(1, Math.floor(opts.page ?? 1)));
  const ids = filtered.slice((page - 1) * perPage, page * perPage).map((r) => r.id);
  const full = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { brand: true, category: true, images: { orderBy: { sortOrder: "asc" }, take: 1 }, shippingProfile: true, inventory: true },
  });
  const byId = new Map(full.map((p) => [p.id, p]));
  const items = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => toCard(p, rules));
  return { items, total, page, pages, perPage, brands, priceRange };
}

/** Eski imza: sayfalamasız ilk N ürün (ana sayfa vb.). */
export async function listCategoryProducts(categoryIds: string[] | null, opts: { sort?: string; take?: number; q?: string } = {}) {
  return (await listProducts(categoryIds, { ...opts, take: opts.take ?? 48 })).items;
}

/** Sorgu parametrelerinden liste seçenekleri (?sirala, ?sayfa, ?marka=a,b, ?min, ?max, ?stokta=1). */
export function listOptionsFrom(sp: Record<string, string | string[] | undefined>): ListOptions {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const num = (k: string) => {
    const v = Number(s(k).replace(",", "."));
    return s(k) !== "" && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const brandIds = (Array.isArray(sp.marka) ? sp.marka : s("marka").split(",")).map((x) => x.trim()).filter(Boolean).slice(0, 20);
  return { sort: s("sirala"), page: Number(s("sayfa")) || 1, brandIds, minPrice: num("min"), maxPrice: num("max"), inStock: s("stokta") === "1" };
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
