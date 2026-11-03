import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { activeDiscounts, toCard, VISIBLE } from "@/server/catalog";
import ProductCard from "@/components/shop/ProductCard";

const INCLUDE = { brand: true, category: true, images: { orderBy: { sortOrder: "asc" as const }, take: 1 }, shippingProfile: true, inventory: true };

export default async function HomePage() {
  const now = new Date();
  const [banners, mains, newest, best, rules, brands] = await Promise.all([
    prisma.banner.findMany({
      where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { sortOrder: "asc" },
      take: 3,
    }),
    prisma.category.findMany({ where: { parentId: null, isActive: true }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { children: true } } } }),
    prisma.product.findMany({ where: VISIBLE, include: INCLUDE, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.product.findMany({ where: { ...VISIBLE, soldCount: { gt: 0 } }, include: INCLUDE, orderBy: { soldCount: "desc" }, take: 10 }),
    activeDiscounts(),
    prisma.brand.findMany({ where: { isActive: true, products: { some: VISIBLE } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 18 }),
  ]);
  const discounted = (await prisma.product.findMany({ where: VISIBLE, include: INCLUDE, orderBy: { updatedAt: "desc" }, take: 60 }))
    .map((p) => toCard(p, rules))
    .filter((c) => c.discounted)
    .slice(0, 10);
  const Grid = ({ title, items, testId }: { title: string; items: ReturnType<typeof toCard>[]; testId: string }) =>
    items.length ? (
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid={testId}>
        <h2 className="h2">{title}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {items.map((p) => (
            <ProductCard key={p.id} p={p} back="/" />
          ))}
        </div>
      </section>
    ) : null;
  return (
    <>
      {banners.length > 0 && (
        <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }} data-testid="banners">
          {banners.map((b) => (
            <div
              key={b.id}
              style={{
                minHeight: 200, borderRadius: 12, padding: 28, color: "#fff", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8,
                background: b.imageUrl ? `linear-gradient(90deg, rgba(10,25,48,.85), rgba(10,25,48,.2)), url(${b.imageUrl}) center/cover` : "var(--navy-900)",
              }}
            >
              <h2 className="h2" style={{ color: "#fff", margin: 0 }}>
                {b.title}
              </h2>
              {b.subtitle && <p style={{ margin: 0 }}>{b.subtitle}</p>}
              {b.linkUrl && (
                <Link href={b.linkUrl} className="oy-btn oy-btn--primary oy-btn--sm" style={{ alignSelf: "flex-start" }}>
                  {b.buttonText || "İncele"}
                </Link>
              )}
            </div>
          ))}
        </section>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 className="h2">Ürün grupları</h1>
        <div className="grid-4">
          {mains.map((m) => (
            <Link key={m.id} className="oy-ccard" href={`/kategori/${m.slug}`}>
              {m.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageUrl} alt="" width={110} height={100} style={{ width: "100%", height: 100, objectFit: "contain" }} loading="lazy" />
              )}
              <span className="oy-ccard__name">{m.name}</span>
              <span className="oy-ccard__count">{m._count.children} alt kategori</span>
            </Link>
          ))}
        </div>
      </section>
      <Grid title="Kampanyalı ürünler" items={discounted} testId="home-discounted" />
      <Grid title="Çok satanlar" items={best.map((p) => toCard(p, rules))} testId="home-best" />
      <Grid title="Yeni ürünler" items={newest.map((p) => toCard(p, rules))} testId="home-new" />
      {newest.length === 0 && <p className="muted">Henüz yayında ürün yok. Admin panelinden ürün ekleyip aktif yapın.</p>}
      {brands.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="h2">Markalar</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {brands.map((b) => (
              <Link key={b.id} href={`/arama?q=${encodeURIComponent(b.name)}`} className="oy-btn oy-btn--outline oy-btn--sm">
                {b.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
