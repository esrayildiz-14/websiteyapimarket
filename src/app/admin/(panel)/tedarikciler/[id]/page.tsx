import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, PURCHASING_VIEW, requireAnyStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import { formatTL } from "@/lib/money";
import { PURCHASE_STATUS_LABEL } from "@/lib/purchase-calc";
import { supplierPerformance } from "@/server/supplier-admin";
import SupplierFields from "../SupplierFields";
import { removeSupplierProductAction, supplierProductAction, updateSupplierAction } from "../actions";

export const metadata = { title: "Tedarikçi" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SupplierPage({ params, searchParams }: Props) {
  const user = await requireAnyStaff(PURCHASING_VIEW);
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: {
      products: { include: { product: true }, orderBy: { product: { name: "asc" } } },
      purchaseOrders: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!s) notFound();
  const perf = await supplierPerformance(s.id);
  const write = can(user, "supplier.write");
  const d = (x: Date | null) => (x ? x.toLocaleDateString("tr-TR") : "—");

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{s.name}</h1>
          <p>{s.code}{s.paymentTerms ? ` · ${s.paymentTerms}` : ""}</p>
        </div>
        <div className="actions">
          <Link className="oy-btn oy-btn--ghost oy-btn--sm" href="/admin/tedarikciler">← Tedarikçiler</Link>
          {can(user, "purchase.write") && s.status === "ACTIVE" && (
            <Link className="oy-btn oy-btn--primary oy-btn--sm" href={`/admin/satin-alma?yeni=1&tedarikci=${s.id}`}>Satın alma siparişi aç</Link>
          )}
        </div>
      </div>
      <Flash sp={sp} />

      <section className="card" data-testid="supplier-performance">
        <h2>Performans</h2>
        <p className="muted" style={{ marginTop: 0 }}>Yalnız sistemde kayıtlı satın alma ve mal kabul kayıtlarından hesaplanır.</p>
        <div className="form-grid">
          <div><div className="muted">Sipariş sayısı</div><b data-testid="perf-orders">{perf.orderCount}</b></div>
          <div><div className="muted">Teslim alınan tutar (KDV hariç)</div><b data-testid="perf-value">{formatTL(perf.receivedValue)}</b></div>
          <div><div className="muted">Ortalama teslim süresi</div><b data-testid="perf-lead">{perf.avgLeadDays === null ? "Veri yok" : `${perf.avgLeadDays} gün`}</b></div>
          <div><div className="muted">Zamanında teslim</div><b data-testid="perf-ontime">{perf.onTimeRate === null ? "Veri yok" : `%${perf.onTimeRate} (${perf.onTimeBase} sipariş)`}</b></div>
          <div><div className="muted">Teslim oranı (adet)</div><b data-testid="perf-fill">{perf.fillRate === null ? "Veri yok" : `%${perf.fillRate}`}</b></div>
          <div><div className="muted">Bekleyen eksik teslim</div><b data-testid="perf-short">{perf.openShortUnits} adet</b></div>
          <div><div className="muted">İade oranı</div><b>Veri yok (iade modülü henüz yok)</b></div>
        </div>
        {perf.priceChanges.length > 0 && (
          <table className="tbl" data-testid="perf-prices" style={{ marginTop: 12 }}>
            <thead><tr><th>Ürün</th><th className="num">İlk alış</th><th className="num">Son alış</th><th className="num">Değişim</th></tr></thead>
            <tbody>
              {perf.priceChanges.map((p) => (
                <tr key={p.name}><td>{p.name}</td><td className="num">{formatTL(p.first)}</td><td className="num">{formatTL(p.last)}</td><td className="num">%{p.pct}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Tedarikçinin ürünleri ve alış koşulları</h2>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl" data-testid="supplier-products">
            <thead>
              <tr>
                <th>Ürün</th><th>Tedarikçi kodu</th><th className="num">Alış fiyatı</th><th className="num">İskonto</th>
                <th className="num">En az sipariş</th><th className="num">Tedarik süresi</th><th className="num">Tedarikçi stoğu</th>
                <th>Son alış</th>{write && <th />}
              </tr>
            </thead>
            <tbody>
              {s.products.map((p) => (
                <tr key={p.id} data-testid={`sp-row-${p.product.sku}`}>
                  <td><Link href={`/admin/urunler/${p.productId}`}>{p.product.name}</Link><div className="muted">{p.product.sku}</div></td>
                  <td>{p.supplierSku ?? "—"}</td>
                  <td className="num" data-testid="sp-price">{formatTL(p.purchasePrice)}</td>
                  <td className="num">%{Number(p.discountPct)}</td>
                  <td className="num">{p.minOrderQty}</td>
                  <td className="num">{p.leadDays === null ? "—" : `${p.leadDays} gün`}</td>
                  <td className="num">{p.supplierStock ?? "—"}</td>
                  <td data-testid="sp-last">{p.lastPurchaseAt ? `${d(p.lastPurchaseAt)} · ${formatTL(p.lastPurchasePrice)}` : "—"}</td>
                  {write && (
                    <td>
                      <form action={removeSupplierProductAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="supplierId" value={s.id} />
                        <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">Kaldır</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {!s.products.length && <tr><td colSpan={9} className="muted">Henüz ürün bağlanmadı.</td></tr>}
            </tbody>
          </table>
        </div>
        {write && (
          <form action={supplierProductAction} className="form-grid" data-testid="sp-form" style={{ marginTop: 16 }}>
            <input type="hidden" name="supplierId" value={s.id} />
            <label className="oy-field"><span className="oy-field__label req">Ürün kodu / barkod</span><input className="oy-input" name="code" required autoComplete="off" /></label>
            <label className="oy-field"><span className="oy-field__label">Tedarikçi ürün kodu</span><input className="oy-input" name="supplierSku" maxLength={60} /></label>
            <label className="oy-field"><span className="oy-field__label req">Alış fiyatı (KDV hariç)</span><input className="oy-input" name="purchasePrice" inputMode="decimal" required /></label>
            <label className="oy-field"><span className="oy-field__label">İskonto (%)</span><input className="oy-input" name="discountPct" inputMode="decimal" /></label>
            <label className="oy-field"><span className="oy-field__label">En az sipariş adedi</span><input className="oy-input" name="minOrderQty" type="number" min={1} /></label>
            <label className="oy-field"><span className="oy-field__label">Tedarik süresi (gün)</span><input className="oy-input" name="leadDays" type="number" min={0} /></label>
            <label className="oy-field"><span className="oy-field__label">Tedarikçi stoğu</span><input className="oy-input" name="supplierStock" type="number" min={0} /></label>
            <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" data-testid="sp-submit">Kaydet (varsa günceller)</button></div>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Son satın alma siparişleri</h2>
        <table className="tbl">
          <thead><tr><th>No</th><th>Tarih</th><th>Durum</th><th className="num">Tutar (KDV dahil)</th></tr></thead>
          <tbody>
            {s.purchaseOrders.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/satin-alma/${o.id}`}>{o.number}</Link></td>
                <td>{d(o.createdAt)}</td>
                <td>{PURCHASE_STATUS_LABEL[o.status]}</td>
                <td className="num">{formatTL(o.grandTotal)}</td>
              </tr>
            ))}
            {!s.purchaseOrders.length && <tr><td colSpan={4} className="muted">Sipariş yok.</td></tr>}
          </tbody>
        </table>
      </section>

      {write && (
        <section className="card">
          <h2>Tedarikçi bilgileri</h2>
          <ActionForm action={updateSupplierAction.bind(null, s.id)} testId="supplier-edit-form">
            <SupplierFields
              v={{
                code: s.code, name: s.name, contactName: s.contactName ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "",
                taxOffice: s.taxOffice ?? "", taxNumber: s.taxNumber ?? "", productGroups: s.productGroups ?? "", paymentTerms: s.paymentTerms ?? "",
                avgLeadDays: s.avgLeadDays === null ? "" : String(s.avgLeadDays), status: s.status, notes: s.notes ?? "",
              }}
            />
            <div className="actions"><button className="oy-btn oy-btn--primary" type="submit" data-testid="supplier-edit-submit">Kaydet</button></div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
