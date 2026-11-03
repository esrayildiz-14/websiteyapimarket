import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { can, requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import { deleteProductAction, duplicateProductAction, setStatusAction } from "./actions";

export const metadata = { title: "Ürün yönetimi" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 25;

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireStaff("product.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const cat = typeof sp.kategori === "string" ? sp.kategori : "";
  const durum = typeof sp.durum === "string" ? sp.durum : "";
  const marka = typeof sp.marka === "string" ? sp.marka : "";
  const sirala = typeof sp.sirala === "string" ? sp.sirala : "";
  const ORDER: Record<string, Prisma.ProductOrderByWithRelationInput> = {
    "": { updatedAt: "desc" }, ad: { name: "asc" }, "fiyat-artan": { price: "asc" }, "fiyat-azalan": { price: "desc" }, yeni: { createdAt: "desc" },
  };
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const deleted = durum === "silinen";

  const catFilter = cat ? { OR: [{ categoryId: cat }, { category: { parentId: cat } }] } : {};
  const where = {
    deletedAt: deleted ? { not: null } : null,
    ...(durum === "aktif" ? { status: "ACTIVE" as const } : durum === "pasif" ? { status: "PASSIVE" as const } : {}),
    ...(durum === "kritik" ? { id: { in: await criticalIds() } } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q.toUpperCase() } }, { barcode: q }] } : {}),
    ...catFilter,
    ...(marka ? { brandId: marka } : {}),
  };
  const [total, products, mains] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { brand: true, inventory: true, category: { include: { parent: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1 }, shippingProfile: true },
      orderBy: [ORDER[sirala] ?? ORDER[""], { id: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
  ]);
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) =>
    `?${new URLSearchParams({ ...(q && { q }), ...(cat && { kategori: cat }), ...(durum && { durum }), ...(marka && { marka }), ...(sirala && { sirala }), sayfa: String(p) })}`;
  const write = can(user, "product.write");

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Ürün yönetimi</h1>
          <p>{total} ürün{deleted ? " (silinenler)" : ""}</p>
        </div>
        {write && (
          <Link className="oy-btn oy-btn--primary" href="/admin/urunler/yeni">
            + Yeni ürün ekle
          </Link>
        )}
      </div>
      <Flash sp={sp} />

      <form className="toolbar" role="search">
        <label className="oy-field">
          <span className="oy-field__label">Ara</span>
          <input className="oy-input" name="q" defaultValue={q} placeholder="Ad, ürün kodu veya barkod" style={{ minWidth: 240 }} />
        </label>
        <label className="oy-field">
          <span className="oy-field__label">Kategori</span>
          <select className="oy-select" name="kategori" defaultValue={cat}>
            <option value="">Tümü</option>
            {mains.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="oy-field">
          <span className="oy-field__label">Durum</span>
          <select className="oy-select" name="durum" defaultValue={durum}>
            <option value="">Tümü (silinmemiş)</option>
            <option value="aktif">Aktif</option>
            <option value="pasif">Pasif</option>
            <option value="kritik">Kritik stok (≤ minimum)</option>
            <option value="silinen">Silinenler</option>
          </select>
        </label>
        <label className="oy-field">
          <span className="oy-field__label">Marka</span>
          <select className="oy-select" name="marka" defaultValue={marka}>
            <option value="">Tümü</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="oy-field">
          <span className="oy-field__label">Sırala</span>
          <select className="oy-select" name="sirala" defaultValue={sirala}>
            <option value="">Son güncellenen</option>
            <option value="yeni">Son eklenen</option>
            <option value="ad">Ada göre</option>
            <option value="fiyat-artan">Fiyat (artan)</option>
            <option value="fiyat-azalan">Fiyat (azalan)</option>
          </select>
        </label>
        <button className="oy-btn oy-btn--secondary" type="submit">
          Filtrele
        </button>
      </form>

      <div className="tbl-wrap">
        <table className="tbl" data-testid="product-table">
          <thead>
            <tr>
              <th aria-label="Görsel" />
              <th>Ürün</th>
              <th>Kategori</th>
              <th className="num">Fiyat</th>
              <th className="num">Stok</th>
              <th>Kargo</th>
              <th>Durum</th>
              <th aria-label="İşlemler" />
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: "center" }} className="muted">
                  Ürün bulunamadı.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} data-sku={p.sku}>
                <td>
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={p.images[0].url} alt="" />
                  ) : (
                    <span className="thumb" />
                  )}
                </td>
                <td>
                  <Link href={`/admin/urunler/${p.id}`} style={{ fontWeight: 600 }}>
                    {p.name}
                  </Link>
                  <div className="muted">
                    {p.sku}
                    {p.brand ? ` · ${p.brand.name}` : ""}
                  </div>
                </td>
                <td className="muted">{p.category.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category.name}</td>
                <td className="num">
                  {p.salePrice ? (
                    <>
                      <b style={{ color: "var(--orange-700)" }}>{formatTL(p.salePrice)}</b>
                      <div className="muted" style={{ textDecoration: "line-through" }}>
                        {formatTL(p.price)}
                      </div>
                    </>
                  ) : (
                    formatTL(p.price)
                  )}
                </td>
                <td className="num">
                  <span className={`pill ${stockOf(p) <= 0 ? "err" : stockOf(p) <= (p.inventory?.minStock ?? 0) ? "warn" : "off"}`}>{stockOf(p)}</span>
                </td>
                <td>{p.shippingProfile.name}</td>
                <td>
                  {p.deletedAt ? (
                    <span className="pill err">Silindi</span>
                  ) : (
                    <span className={`pill ${p.status === "ACTIVE" ? "on" : "off"}`}>{p.status === "ACTIVE" ? "Aktif" : "Pasif"}</span>
                  )}
                </td>
                <td>
                  {write && !p.deletedAt && (
                    <div className="actions" style={{ flexWrap: "nowrap" }}>
                      <Link className="oy-btn oy-btn--outline oy-btn--sm" href={`/admin/urunler/${p.id}`}>
                        Düzenle
                      </Link>
                      <form action={setStatusAction} className="inline-form">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="status" value={p.status === "ACTIVE" ? "PASSIVE" : "ACTIVE"} />
                        <input type="hidden" name="back" value={`/admin/urunler${qs(page)}`} />
                        <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">
                          {p.status === "ACTIVE" ? "Pasif yap" : "Aktif yap"}
                        </button>
                      </form>
                      <form action={duplicateProductAction} className="inline-form">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">
                          Kopyala
                        </button>
                      </form>
                      <form action={deleteProductAction} className="inline-form">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="danger-link" type="submit" aria-label={`${p.name} ürününü sil`}>
                          Sil
                        </button>
                      </form>
                    </div>
                  )}
                  {p.deletedAt && (
                    <Link className="oy-btn oy-btn--outline oy-btn--sm" href={`/admin/urunler/${p.id}`}>
                      Görüntüle
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="actions" aria-label="Sayfalar">
          {page > 1 && (
            <Link className="oy-btn oy-btn--outline oy-btn--sm" href={qs(page - 1)}>
              ‹ Önceki
            </Link>
          )}
          <span className="muted">
            Sayfa {page} / {pages}
          </span>
          {page < pages && (
            <Link className="oy-btn oy-btn--outline oy-btn--sm" href={qs(page + 1)}>
              Sonraki ›
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

/** Satılabilir adet (stok − ödeme bekleyen siparişlere ayrılan) */
function stockOf(p: { inventory: { quantity: number; reserved: number } | null }) {
  return (p.inventory?.quantity ?? 0) - (p.inventory?.reserved ?? 0);
}

/** Kritik stok: satılabilir adet ≤ minimum stok */
async function criticalIds() {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM products p LEFT JOIN inventory i ON i."productId" = p.id
    WHERE COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0) <= COALESCE(i."minStock", 0)`;
  return rows.map((r) => r.id);
}
