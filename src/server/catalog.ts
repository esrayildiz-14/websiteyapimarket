import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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


/** Kampanya kurallarından, ürünün müşteriye görünen fiyatını veren SQL ifadesi (effectivePrice ile aynı kural). */
function effectivePriceSql(rules: DiscountRule[]) {
  const now = new Date();
  const parts: Prisma.Sql[] = [Prisma.sql`p.price`, Prisma.sql`CASE WHEN p."salePrice" IS NOT NULL AND p."salePrice" < p.price THEN p."salePrice" ELSE p.price END`];
  for (const r of rules) {
    if (!r.isActive || now < r.startsAt || now > r.endsAt) continue;
    const cond =
      r.target === "ALL" ? Prisma.sql`TRUE`
      : r.target === "PRODUCT" ? Prisma.sql`p.id = ${r.targetId}`
      : r.target === "CATEGORY" ? Prisma.sql`(p."categoryId" = ${r.targetId} OR c."parentId" = ${r.targetId})`
      : Prisma.sql`p."brandId" = ${r.targetId}`;
    const val = r.type === "PERCENT" ? Prisma.sql`ROUND(p.price * (1 - ${r.value}::numeric / 100), 2)` : Prisma.sql`GREATEST(0, p.price - ${r.value}::numeric)`;
    parts.push(Prisma.sql`CASE WHEN ${cond} THEN ${val} ELSE p.price END`);
  }
  return Prisma.sql`LEAST(${Prisma.join(parts)})`;
}

/**
 * Ürün listesi: filtre (marka, fiyat aralığı, stokta olanlar), sıralama ve sayfalama — tamamı veritabanında.
 * Fiyat filtresi ve sıralaması müşterinin gördüğü GEÇERLİ fiyata göre (indirimli fiyat ve kampanyalar dahil).
 * Yalnız istenen sayfanın ürünleri yüklenir; on binlerce üründe de sabit maliyet.
 */
export async function listProducts(categoryIds: string[] | null, opts: ListOptions = {}) {
  const rules = await activeDiscounts();
  const eff = effectivePriceSql(rules);
  const q = opts.q?.trim();
  const like = q ? `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%` : "";
  const base = Prisma.sql`
    FROM products p
    JOIN categories c ON c.id = p."categoryId"
    LEFT JOIN categories pc ON pc.id = c."parentId"
    LEFT JOIN brands b ON b.id = p."brandId"
    LEFT JOIN inventory i ON i."productId" = p.id
    WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND c."isActive" AND (c."parentId" IS NULL OR pc."isActive")
      ${categoryIds ? Prisma.sql`AND p."categoryId" IN (${Prisma.join(categoryIds.length ? categoryIds : ["-"])})` : Prisma.empty}
      ${q ? Prisma.sql`AND (p.name ILIKE ${like} OR p.sku ILIKE ${like.toUpperCase()} OR p.barcode = ${q} OR b.name ILIKE ${like} OR p.model ILIKE ${like})` : Prisma.empty}`;
  const filters = Prisma.sql`
      ${opts.brandIds?.length ? Prisma.sql`AND p."brandId" IN (${Prisma.join(opts.brandIds)})` : Prisma.empty}
      ${opts.minPrice != null ? Prisma.sql`AND ${eff} >= ${opts.minPrice}` : Prisma.empty}
      ${opts.maxPrice != null ? Prisma.sql`AND ${eff} <= ${opts.maxPrice}` : Prisma.empty}
      ${opts.inStock ? Prisma.sql`AND COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0) > 0` : Prisma.empty}`;
  const order =
    opts.sort === "fiyat-artan" ? Prisma.sql`${eff} ASC, p.id`
    : opts.sort === "fiyat-azalan" ? Prisma.sql`${eff} DESC, p.id`
    : opts.sort === "yeni" ? Prisma.sql`p."createdAt" DESC, p.id`
    : Prisma.sql`p."soldCount" DESC, p.id`;

  const perPage = opts.take ?? Math.min(96, Math.max(1, Math.floor(opts.perPage ?? 24)));
  const requested = opts.take ? 1 : Math.max(1, Math.min(100_000, Math.floor(opts.page ?? 1) || 1));
  const [countRow, facets] = await Promise.all([
    prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n ${base} ${filters}`,
    // marka seçenekleri ve fiyat aralığı: liste kapsamında (marka/fiyat/stok filtresinden bağımsız)
    prisma.$queryRaw<{ id: string | null; name: string | null; count: number; min: string; max: string }[]>`
      SELECT p."brandId" AS id, MIN(b.name) AS name, COUNT(*)::int AS count, MIN(${eff})::text AS min, MAX(${eff})::text AS max
      ${base} GROUP BY p."brandId"`,
  ]);
  const total = countRow[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pages, requested);
  const idRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id ${base} ${filters} ORDER BY ${order} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;
  const ids = idRows.map((r) => r.id);
  const full = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        include: { brand: true, category: true, images: { orderBy: { sortOrder: "asc" }, take: 1 }, shippingProfile: true, inventory: true },
      })
    : [];
  const byId = new Map(full.map((p) => [p.id, p]));
  const items = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => toCard(p, rules));
  const brands = facets
    .filter((f): f is typeof f & { id: string; name: string } => !!f.id && !!f.name)
    .map((f) => ({ id: f.id, name: f.name, count: f.count }))
    .sort((x, y) => x.name.localeCompare(y.name, "tr"));
  const priceRange = facets.length ? { min: Math.min(...facets.map((f) => Number(f.min))), max: Math.max(...facets.map((f) => Number(f.max))) } : null;
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
