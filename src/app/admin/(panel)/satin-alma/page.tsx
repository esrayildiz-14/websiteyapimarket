import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, PURCHASING_VIEW, requireAnyStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { formatTL } from "@/lib/money";
import { PURCHASE_STATUS_LABEL } from "@/lib/purchase-calc";
import type { PurchaseStatus } from "@/generated/prisma/client";
import { createPurchaseAction } from "./actions";

export const metadata = { title: "Satın alma" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function PurchasesPage({ searchParams }: { searchParams: SP }) {
  const user = await requireAnyStaff(PURCHASING_VIEW);
  const sp = await searchParams;
  const durum = typeof sp.durum === "string" && sp.durum in PURCHASE_STATUS_LABEL ? (sp.durum as PurchaseStatus) : null;
  const [orders, counts, suppliers, warehouses] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: durum ? { status: durum } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { supplier: true, warehouse: true, _count: { select: { items: true } } },
    }),
    prisma.purchaseOrder.groupBy({ by: ["status"], _count: true }),
    prisma.supplier.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count]));
  const pre = typeof sp.tedarikci === "string" ? sp.tedarikci : "";

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Satın alma</h1>
          <p>Sipariş stoğu değiştirmez; stok yalnız mal kabulde, seçilen depoya girer.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className="actions" style={{ flexWrap: "wrap" }}>
        <Link className={`oy-btn oy-btn--sm ${durum ? "oy-btn--ghost" : "oy-btn--secondary"}`} href="/admin/satin-alma">Tümü</Link>
        {Object.entries(PURCHASE_STATUS_LABEL).map(([k, l]) => (
          <Link key={k} className={`oy-btn oy-btn--sm ${durum === k ? "oy-btn--secondary" : "oy-btn--ghost"}`} href={`/admin/satin-alma?durum=${k}`} data-testid={`po-filter-${k}`}>
            {l} ({c[k] ?? 0})
          </Link>
        ))}
      </div>

      <div className="tbl-wrap">
        <table className="tbl" data-testid="po-table">
          <thead>
            <tr><th>No</th><th>Tedarikçi</th><th>Depo</th><th>Durum</th><th className="num">Kalem</th><th>Beklenen</th><th className="num">Toplam (KDV dahil)</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} data-testid={`po-row-${o.number}`}>
                <td><Link href={`/admin/satin-alma/${o.id}`} style={{ fontWeight: 600 }}>{o.number}</Link><div className="muted">{o.createdAt.toLocaleDateString("tr-TR")}</div></td>
                <td>{o.supplier.name}</td>
                <td>{o.warehouse.name}</td>
                <td>{PURCHASE_STATUS_LABEL[o.status]}</td>
                <td className="num">{o._count.items}</td>
                <td>{o.expectedAt ? o.expectedAt.toLocaleDateString("tr-TR") : "—"}</td>
                <td className="num">{formatTL(o.grandTotal)}</td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan={7} className="muted">Sipariş yok.</td></tr>}
          </tbody>
        </table>
      </div>

      {can(user, "purchase.write") && (
        <section className="card" id="yeni">
          <h2>Yeni satın alma siparişi</h2>
          {suppliers.length === 0 ? (
            <p className="muted">Önce <Link href="/admin/tedarikciler">aktif bir tedarikçi</Link> ekleyin.</p>
          ) : (
            <form action={createPurchaseAction} className="form-grid" data-testid="po-create-form">
              <label className="oy-field">
                <span className="oy-field__label req">Tedarikçi</span>
                <select className="oy-select" name="supplierId" defaultValue={pre} required>
                  <option value="" disabled>Seçin</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Teslim alınacak depo</span>
                <select className="oy-select" name="warehouseId" defaultValue={warehouses[0]?.id}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Beklenen teslim tarihi</span>
                <input className="oy-input" name="expectedAt" type="date" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Not</span>
                <input className="oy-input" name="note" maxLength={1000} />
              </label>
              <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" data-testid="po-create-submit">Taslak oluştur</button></div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
