import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requireStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { MOVEMENT_LABEL } from "@/lib/movement";
import { minStockAction, stockEntryAction } from "./actions";

export const metadata = { title: "Stok yönetimi" };
type SP = Promise<Record<string, string | string[] | undefined>>;


export default async function StockPage({ searchParams }: { searchParams: SP }) {
  const user = await requireStaff("product.read");
  const sp = await searchParams;
  const critical = sp.durum === "kritik";
  const write = can(user, "stock.write");
  const [rows, movements, warehouses] = await Promise.all([
    prisma.$queryRaw<{ id: string; name: string; sku: string; quantity: number; reserved: number; minStock: number }[]>`
      SELECT p.id, p.name, p.sku, COALESCE(i.quantity, 0)::int AS quantity, COALESCE(i.reserved, 0)::int AS reserved,
             COALESCE(i."minStock", 0)::int AS "minStock"
      FROM products p LEFT JOIN inventory i ON i."productId" = p.id
      WHERE p."deletedAt" IS NULL
        AND (${critical} = false OR COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0) <= COALESCE(i."minStock", 0))
      ORDER BY (COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0)) ASC, p.name ASC
      LIMIT 200`,
    prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { product: true, variant: true, user: true, order: true, warehouse: true } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] }),
  ]);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Stok yönetimi</h1>
          <p>Satılabilir = stok − ödeme bekleyen siparişlere ayrılan adet.</p>
        </div>
        <div className="actions">
          <Link className={`oy-btn oy-btn--sm ${critical ? "oy-btn--ghost" : "oy-btn--secondary"}`} href="/admin/stok">
            Tümü
          </Link>
          <Link className={`oy-btn oy-btn--sm ${critical ? "oy-btn--secondary" : "oy-btn--ghost"}`} href="/admin/stok?durum=kritik">
            Kritik stok
          </Link>
        </div>
      </div>
      <Flash sp={sp} />

      {write && (
        <section className="card">
          <h2>Stok hareketi gir</h2>
          <form action={stockEntryAction} className="form-grid" data-testid="stock-form">
            <label className="oy-field">
              <span className="oy-field__label req">Ürün / varyant kodu</span>
              <input className="oy-input" name="sku" required style={{ textTransform: "uppercase" }} />
            </label>
            <label className="oy-field">
              <span className="oy-field__label req">İşlem</span>
              <select className="oy-select" name="mode" defaultValue="in">
                <option value="in">Giriş (+)</option>
                <option value="out">Çıkış / fire (−)</option>
                <option value="count">Sayım (stoğu bu değere getir)</option>
              </select>
            </label>
            <label className="oy-field">
              <span className="oy-field__label req">Miktar</span>
              <input className="oy-input" name="quantity" type="number" min={0} step={1} required />
            </label>
            <label className="oy-field">
              <span className="oy-field__label">Açıklama</span>
              <input className="oy-input" name="note" maxLength={300} placeholder="Ör. irsaliye no" />
            </label>
            {warehouses.length > 1 && (
              <label className="oy-field">
                <span className="oy-field__label">Depo</span>
                <select className="oy-select" name="warehouseId" defaultValue="">
                  <option value="">Varsayılan depo (sayımda: satılabilir toplam)</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="actions full">
              <button className="oy-btn oy-btn--primary" type="submit" data-testid="stock-submit">
                Kaydet
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="tbl-wrap">
        <table className="tbl" data-testid="stock-table">
          <thead>
            <tr>
              <th>Ürün</th>
              <th className="num">Stok</th>
              <th className="num">Ayrılan</th>
              <th className="num">Satılabilir</th>
              <th className="num">Minimum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avail = r.quantity - r.reserved;
              return (
                <tr key={r.id} data-testid={`stock-row-${r.sku}`}>
                  <td>
                    <Link href={`/admin/urunler/${r.id}`} style={{ fontWeight: 600 }}>
                      {r.name}
                    </Link>
                    <div className="muted">{r.sku}</div>
                  </td>
                  <td className="num">{r.quantity}</td>
                  <td className="num">{r.reserved}</td>
                  <td className="num">
                    <span className={`pill ${avail <= 0 ? "err" : avail <= r.minStock ? "warn" : "off"}`} data-testid="available">
                      {avail}
                    </span>
                  </td>
                  <td className="num">
                    {write ? (
                      <form action={minStockAction} className="actions" style={{ justifyContent: "flex-end" }}>
                        <input type="hidden" name="id" value={r.id} />
                        <input className="oy-input" name="minStock" type="number" min={0} defaultValue={r.minStock} aria-label="Minimum stok" style={{ width: 80 }} />
                        <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">
                          Kaydet
                        </button>
                      </form>
                    ) : (
                      r.minStock
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="card">
        <h2>Son stok hareketleri</h2>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl" data-testid="movement-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Ürün</th>
                <th>Hareket</th>
                <th>Depo</th>
                <th className="num">Miktar</th>
                <th className="num">Depoda kalan</th>
                <th>Açıklama</th>
                <th>Kullanıcı</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.createdAt.toLocaleString("tr-TR")}</td>
                  <td>
                    {m.product.name}
                    {m.variant ? ` · ${m.variant.name}` : ""}
                  </td>
                  <td>{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                  <td className="muted">{m.warehouse?.name ?? "—"}</td>
                  <td className="num">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                  <td className="num">{m.stockAfter}</td>
                  <td className="muted">
                    {m.note ?? ""}
                    {m.order ? ` · ${m.order.orderNumber}` : ""}
                  </td>
                  <td className="muted">{m.user ? `${m.user.firstName} ${m.user.lastName}` : "Sistem"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
