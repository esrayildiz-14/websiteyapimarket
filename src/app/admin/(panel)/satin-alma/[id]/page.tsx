import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, PURCHASING_VIEW, requireAnyStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { formatTL } from "@/lib/money";
import { canDo, PURCHASE_STATUS_LABEL } from "@/lib/purchase-calc";
import { addItemAction, approveAction, backToDraftAction, cancelAction, receiveAction, removeItemAction, submitAction } from "../actions";

export const metadata = { title: "Satın alma siparişi" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const DOC: Record<string, string> = { IRSALIYE: "İrsaliye", FATURA: "Fatura", IRSALIYELI_FATURA: "İrsaliyeli fatura" };

export default async function PurchasePage({ params, searchParams }: Props) {
  const user = await requireAnyStaff(PURCHASING_VIEW);
  const { id } = await params;
  const sp = await searchParams;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true, warehouse: true,
      items: { orderBy: { productName: "asc" } },
      receipts: { orderBy: { createdAt: "desc" }, include: { items: { include: { orderItem: true } } } },
    },
  });
  if (!po) notFound();
  const people = await prisma.user.findMany({ where: { id: { in: [po.createdById, po.approvedById].filter((x): x is string => !!x) } } });
  const name = (uid: string | null) => {
    const p = people.find((x) => x.id === uid);
    return p ? `${p.firstName} ${p.lastName}` : "—";
  };
  const edit = canDo("edit", po.status) && can(user, "purchase.write");
  const today = new Date().toISOString().slice(0, 10);
  const hidden = <input type="hidden" name="poId" value={po.id} />;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{po.number}</h1>
          <p>
            <span data-testid="po-status">{PURCHASE_STATUS_LABEL[po.status]}</span> · <Link href={`/admin/tedarikciler/${po.supplierId}`}>{po.supplier.name}</Link> → {po.warehouse.name}
            {po.expectedAt ? ` · beklenen ${po.expectedAt.toLocaleDateString("tr-TR")}` : ""}
          </p>
        </div>
        <div className="actions">
          <Link className="oy-btn oy-btn--ghost oy-btn--sm" href="/admin/satin-alma">← Satın alma</Link>
        </div>
      </div>
      <Flash sp={sp} />

      <section className="card">
        <h2>Kalemler</h2>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl" data-testid="po-items">
            <thead>
              <tr>
                <th>Ürün</th><th className="num">Sipariş</th><th className="num">Teslim alınan</th><th className="num">Birim fiyat</th>
                <th className="num">İskonto</th><th className="num">KDV</th><th className="num">Net tutar</th>{edit && <th />}
              </tr>
            </thead>
            <tbody>
              {po.items.map((i) => (
                <tr key={i.id} data-testid={`po-item-${i.sku}`}>
                  <td>{i.productName}<div className="muted">{i.sku}{i.supplierSku ? ` · tedarikçi kodu ${i.supplierSku}` : ""}</div></td>
                  <td className="num" data-testid="qty">{i.quantity}</td>
                  <td className="num" data-testid="received">{i.receivedQty}</td>
                  <td className="num">{formatTL(i.unitPrice)}</td>
                  <td className="num">%{Number(i.discountPct)}</td>
                  <td className="num">%{i.vatRate}</td>
                  <td className="num" data-testid="net">{formatTL(i.lineNet)}</td>
                  {edit && (
                    <td>
                      <form action={removeItemAction}>
                        {hidden}
                        <input type="hidden" name="itemId" value={i.id} />
                        <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">Çıkar</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {!po.items.length && <tr><td colSpan={8} className="muted">Henüz ürün eklenmedi.</td></tr>}
            </tbody>
            <tfoot>
              <tr><td colSpan={6} className="num">İskonto</td><td className="num">{formatTL(po.discountTotal)}</td></tr>
              <tr><td colSpan={6} className="num">Ara toplam (KDV hariç)</td><td className="num" data-testid="po-subtotal">{formatTL(po.subtotal)}</td></tr>
              <tr><td colSpan={6} className="num">KDV</td><td className="num" data-testid="po-vat">{formatTL(po.vatTotal)}</td></tr>
              <tr><td colSpan={6} className="num"><b>Genel toplam</b></td><td className="num"><b data-testid="po-total">{formatTL(po.grandTotal)}</b></td></tr>
            </tfoot>
          </table>
        </div>

        {edit && (
          <form action={addItemAction} className="form-grid" data-testid="po-item-form" style={{ marginTop: 16 }}>
            {hidden}
            <label className="oy-field"><span className="oy-field__label req">Ürün kodu / barkod</span><input className="oy-input" name="code" required autoComplete="off" autoFocus /></label>
            <label className="oy-field"><span className="oy-field__label req">Adet</span><input className="oy-input" name="quantity" type="number" min={1} required /></label>
            <label className="oy-field">
              <span className="oy-field__label">Birim fiyat (KDV hariç)</span>
              <input className="oy-input" name="unitPrice" inputMode="decimal" />
              <span className="oy-field__hint">Boşsa tedarikçideki kayıtlı fiyat kullanılır.</span>
            </label>
            <label className="oy-field"><span className="oy-field__label">İskonto (%)</span><input className="oy-input" name="discountPct" inputMode="decimal" /></label>
            <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" data-testid="po-item-submit">Ekle</button></div>
          </form>
        )}

        <div className="actions" style={{ marginTop: 16, flexWrap: "wrap" }}>
          {canDo("submit", po.status) && can(user, "purchase.write") && (
            <form action={submitAction}>{hidden}<button className="oy-btn oy-btn--secondary" type="submit" data-testid="po-submit">Onaya gönder</button></form>
          )}
          {canDo("backToDraft", po.status) && can(user, "purchase.write") && (
            <form action={backToDraftAction}>{hidden}<button className="oy-btn oy-btn--outline" type="submit">Taslağa geri al</button></form>
          )}
          {canDo("approve", po.status) && can(user, "purchase.approve") && (
            <form action={approveAction}>{hidden}<button className="oy-btn oy-btn--primary" type="submit" data-testid="po-approve">Onayla — tedarikçiye iletildi</button></form>
          )}
          {canDo("cancel", po.status) && can(user, "purchase.write") && (
            <form action={cancelAction} className="actions" data-testid="po-cancel-form">
              {hidden}
              <input className="oy-input" name="reason" placeholder="İptal nedeni" aria-label="İptal nedeni" maxLength={500} />
              <button className="oy-btn oy-btn--ghost" type="submit">Siparişi iptal et</button>
            </form>
          )}
        </div>
        <p className="muted">
          Oluşturan: {name(po.createdById)} · {po.createdAt.toLocaleString("tr-TR")}
          {po.approvedAt ? ` · Onaylayan: ${name(po.approvedById)} · ${po.approvedAt.toLocaleString("tr-TR")}` : ""}
          {po.cancelledAt ? ` · İptal: ${po.cancelledAt.toLocaleString("tr-TR")} (${po.cancelReason})` : ""}
          {po.note ? ` · Not: ${po.note}` : ""}
        </p>
      </section>

      {canDo("receive", po.status) && can(user, "purchase.receive") && (
        <section className="card">
          <h2>Mal kabul</h2>
          <p className="muted" style={{ marginTop: 0 }}>Fiziksel olarak teslim aldığınız adetleri girin. Stok {po.warehouse.name} deposuna girer.</p>
          <form action={receiveAction} className="form-grid" data-testid="receive-form">
            {hidden}
            <label className="oy-field">
              <span className="oy-field__label req">Belge türü</span>
              <select className="oy-select" name="documentType" defaultValue="IRSALIYE">
                {Object.entries(DOC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="oy-field"><span className="oy-field__label req">Belge no</span><input className="oy-input" name="documentNo" required maxLength={60} /></label>
            <label className="oy-field"><span className="oy-field__label req">Belge tarihi</span><input className="oy-input" name="documentDate" type="date" defaultValue={today} max={today} required /></label>
            <label className="oy-field"><span className="oy-field__label">Not</span><input className="oy-input" name="note" maxLength={500} /></label>
            <table className="tbl full">
              <thead><tr><th>Ürün</th><th className="num">Kalan</th><th className="num">Teslim alınan</th></tr></thead>
              <tbody>
                {po.items.filter((i) => i.receivedQty < i.quantity).map((i) => (
                  <tr key={i.id}>
                    <td>{i.productName}<div className="muted">{i.sku}</div></td>
                    <td className="num">{i.quantity - i.receivedQty}</td>
                    <td className="num">
                      <input className="oy-input" name={`qty_${i.id}`} type="number" min={0} max={i.quantity - i.receivedQty} aria-label={`${i.sku} teslim alınan`} style={{ width: 100 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" data-testid="receive-submit">Mal kabulü kaydet</button></div>
          </form>
        </section>
      )}

      <section className="card">
        <h2>Mal kabul geçmişi</h2>
        <table className="tbl" data-testid="receipts">
          <thead><tr><th>No</th><th>Tarih</th><th>Belge</th><th>Kalemler</th></tr></thead>
          <tbody>
            {po.receipts.map((r) => (
              <tr key={r.id}>
                <td>{r.number}</td>
                <td>{r.createdAt.toLocaleString("tr-TR")}</td>
                <td>{DOC[r.documentType]} {r.documentNo} · {r.documentDate.toLocaleDateString("tr-TR")}</td>
                <td>{r.items.map((x) => `${x.orderItem.sku} × ${x.quantity}`).join(", ")}</td>
              </tr>
            ))}
            {!po.receipts.length && <tr><td colSpan={4} className="muted">Henüz mal kabul yapılmadı.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
