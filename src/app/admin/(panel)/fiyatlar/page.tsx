import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { formatTL, toInputMoney } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import { bulkPriceAction, updatePriceAction } from "./actions";

export const metadata = { title: "Fiyat yönetimi" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 30;

export default async function PricesPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("price.write");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const where = {
    deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q.toUpperCase() } }] } : {}),
  };
  const [total, products, mains, brands, history] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE, take: PAGE, include: { brand: true } }),
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" }, include: { children: { orderBy: { sortOrder: "asc" } } } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.priceHistory.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { product: true, changedBy: true } }),
  ]);
  const backUrl = `/admin/fiyatlar?${new URLSearchParams({ ...(q && { q }), sayfa: String(page) })}`;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Fiyat yönetimi</h1>
          <p>Fiyatlar KDV dahildir. Her değişiklik fiyat geçmişine kaydedilir.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <section className="card">
        <h2>Toplu fiyat güncelleme</h2>
        <form action={bulkPriceAction} className="form-grid" data-testid="bulk-form">
          <label className="oy-field">
            <span className="oy-field__label">Kapsam</span>
            <select className="oy-select" name="scope" defaultValue="category">
              <option value="category">Kategori (alt kategorileriyle)</option>
              <option value="brand">Marka</option>
              <option value="all">Tüm ürünler</option>
            </select>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Kategori</span>
            <select className="oy-select" name="categoryId" defaultValue="">
              <option value="">—</option>
              {mains.map((m) => (
                <optgroup key={m.id} label={m.name}>
                  <option value={m.id}>{m.name} (tümü)</option>
                  {m.children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Marka</span>
            <select className="oy-select" name="brandId" defaultValue="">
              <option value="">—</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Alan</span>
            <select className="oy-select" name="field" defaultValue="price">
              <option value="price">Satış fiyatı</option>
              <option value="salePrice">İndirimli fiyat</option>
            </select>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">İşlem</span>
            <select className="oy-select" name="op" defaultValue="increase_pct">
              <option value="increase_pct">% artır</option>
              <option value="decrease_pct">% azalt</option>
              <option value="increase_fixed">₺ artır</option>
              <option value="decrease_fixed">₺ azalt</option>
              <option value="clear_sale">İndirimi kaldır</option>
            </select>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Oran / tutar</span>
            <input className="oy-input" name="amount" inputMode="decimal" placeholder="Ör. 10" />
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Yuvarlama</span>
            <select className="oy-select" name="rounding" defaultValue="none">
              <option value="none">Kuruşa (2 hane)</option>
              <option value="integer">Tam liraya</option>
              <option value="x90">,90 ile bitir</option>
            </select>
          </label>
          <label className="oy-check" style={{ alignSelf: "end", minHeight: 44 }}>
            <input type="checkbox" name="confirm" />
            <span>Onaylıyorum, uygula</span>
          </label>
          <div className="actions full">
            <button className="oy-btn oy-btn--secondary" type="submit" data-testid="bulk-submit">
              Önizle / uygula
            </button>
            <span className="muted">Onay kutusu işaretli değilse yalnız kaç ürünün etkileneceği gösterilir, fiyat değişmez.</span>
          </div>
        </form>
      </section>

      <form className="toolbar" role="search">
        <label className="oy-field">
          <span className="oy-field__label">Ara</span>
          <input className="oy-input" name="q" defaultValue={q} placeholder="Ad veya ürün kodu" style={{ minWidth: 240 }} />
        </label>
        <button className="oy-btn oy-btn--secondary" type="submit">
          Ara
        </button>
      </form>

      <div className="tbl-wrap">
        <table className="tbl" data-testid="price-table">
          <thead>
            <tr>
              <th>Ürün</th>
              <th className="num">Satış fiyatı (₺)</th>
              <th className="num">İndirimli (₺)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} data-testid={`price-row-${p.sku}`}>
                <td>
                  <Link href={`/admin/urunler/${p.id}`} style={{ fontWeight: 600 }}>
                    {p.name}
                  </Link>
                  <div className="muted">
                    {p.sku}
                    {p.brand ? ` · ${p.brand.name}` : ""}
                  </div>
                </td>
                <td colSpan={3}>
                  <form action={updatePriceAction} className="actions" style={{ justifyContent: "flex-end" }}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="back" value={backUrl} />
                    <input className="oy-input" name="price" defaultValue={toInputMoney(p.price)} inputMode="decimal" aria-label="Satış fiyatı" style={{ width: 130, textAlign: "right" }} />
                    <input className="oy-input" name="salePrice" defaultValue={toInputMoney(p.salePrice)} inputMode="decimal" aria-label="İndirimli fiyat" style={{ width: 130, textAlign: "right" }} />
                    <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">
                      Kaydet
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="actions">
          {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 30).map((n) => (
            <Link key={n} className={`oy-btn oy-btn--sm ${n === page ? "oy-btn--secondary" : "oy-btn--ghost"}`} href={`?${new URLSearchParams({ ...(q && { q }), sayfa: String(n) })}`}>
              {n}
            </Link>
          ))}
        </div>
      )}

      <section className="card">
        <h2>Son fiyat değişiklikleri</h2>
        <table className="tbl">
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{h.createdAt.toLocaleString("tr-TR")}</td>
                <td>{h.product.name}</td>
                <td className="num">{formatTL(h.price)}</td>
                <td className="num">{h.salePrice ? formatTL(h.salePrice) : "—"}</td>
                <td className="muted">{h.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
