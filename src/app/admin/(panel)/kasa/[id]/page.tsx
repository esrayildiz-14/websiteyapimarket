import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, requireAnyStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { formatTL } from "@/lib/money";
import PrintButton from "./PrintButton";
import { cancelSaleAction, returnAction } from "../actions";

export const metadata = { title: "Mağaza satışı" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SalePage({ params, searchParams }: Props) {
  const user = await requireAnyStaff(["pos.sell", "pos.refund"]);
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.storeSale.findUnique({
    where: { id },
    include: { items: true, payments: { orderBy: { createdAt: "asc" } }, returns: { include: { items: { include: { saleItem: true } } } }, warehouse: true },
  });
  if (!s) notFound();
  const refund = can(user, "pos.refund") && s.status === "COMPLETED";
  const hidden = <input type="hidden" name="saleId" value={s.id} />;
  const open = s.items.filter((i) => i.returnedQty < i.quantity);

  return (
    <>
      <div className="adm-head no-print">
        <div>
          <h1>{s.number}</h1>
          <p><span data-testid="sale-status">{s.status === "COMPLETED" ? "Tamamlandı" : "İptal edildi"}</span> · {s.warehouse.name} · {s.createdAt.toLocaleString("tr-TR")}</p>
        </div>
        <div className="actions">
          <Link className="oy-btn oy-btn--ghost oy-btn--sm" href="/admin/kasa">← Kasa</Link>
          <PrintButton />
        </div>
      </div>
      <div className="no-print"><Flash sp={sp} /></div>

      <section className="card" data-testid="receipt">
        <h2>Satış özeti</h2>
        <p className="muted" style={{ marginTop: 0 }}>Bilgi fişidir; mali değeri yoktur. {s.documentNo ? `Yasal belge no: ${s.documentNo}` : "Yasal fiş ÖKC veya e-arşiv faturayla düzenlenmelidir."}</p>
        <table className="tbl">
          <thead><tr><th>Ürün</th><th className="num">Adet</th><th className="num">Fiyat</th><th className="num">İndirim</th><th className="num">Tutar</th><th className="num">İade</th></tr></thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.id} data-testid={`sale-item-${i.sku}`}>
                <td>{i.name}<div className="muted">{i.sku} · KDV %{i.vatRate}</div></td>
                <td className="num">{i.quantity}</td>
                <td className="num">{formatTL(i.unitPrice)}</td>
                <td className="num">{Number(i.discount) ? formatTL(i.discount) : "—"}</td>
                <td className="num">{formatTL(i.lineTotal)}</td>
                <td className="num" data-testid="returned">{i.returnedQty}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} className="num">İndirim</td><td className="num">{formatTL(s.discountTotal)}</td><td /></tr>
            <tr><td colSpan={4} className="num">KDV (dahil)</td><td className="num">{formatTL(s.vatTotal)}</td><td /></tr>
            <tr><td colSpan={4} className="num"><b>Toplam</b></td><td className="num"><b data-testid="sale-total">{formatTL(s.grandTotal)}</b></td><td /></tr>
            {Number(s.refundedTotal) > 0 && <tr><td colSpan={4} className="num">İade edilen</td><td className="num" data-testid="sale-refunded">{formatTL(s.refundedTotal)}</td><td /></tr>}
          </tfoot>
        </table>
        <h3>Tahsilat hareketleri</h3>
        <table className="tbl" data-testid="sale-payments">
          <tbody>
            {s.payments.map((p) => (
              <tr key={p.id}><td>{p.method === "CASH" ? "Nakit" : "Kart"}</td><td className="num">{formatTL(p.amount)}</td><td className="muted">{p.note ?? ""}</td><td className="muted">{p.createdAt.toLocaleString("tr-TR")}</td></tr>
            ))}
          </tbody>
        </table>
        {s.cancelReason && <p>İptal nedeni: {s.cancelReason}</p>}
      </section>

      {refund && open.length > 0 && (
        <section className="card no-print">
          <h2>İade al</h2>
          <form action={returnAction} className="form-grid" data-testid="return-form">
            {hidden}
            <table className="tbl full">
              <thead><tr><th>Ürün</th><th className="num">İade edilebilir</th><th className="num">İade adedi</th><th>Stoğa al</th></tr></thead>
              <tbody>
                {open.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}<div className="muted">{i.sku}</div></td>
                    <td className="num">{i.quantity - i.returnedQty}</td>
                    <td className="num"><input className="oy-input" type="number" min={0} max={i.quantity - i.returnedQty} name={`qty_${i.id}`} aria-label={`${i.sku} iade adedi`} style={{ width: 90 }} /></td>
                    <td><label className="oy-check"><input type="checkbox" name={`restock_${i.id}`} defaultChecked /><span>Sağlam (stoğa al)</span></label></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="oy-field"><span className="oy-field__label req">İade nedeni</span><input className="oy-input" name="reason" required minLength={3} maxLength={500} /></label>
            <label className="oy-field">
              <span className="oy-field__label">Geri ödeme</span>
              <select className="oy-select" name="method" defaultValue="CASH"><option value="CASH">Nakit</option><option value="CARD">Karta (POS cihazından)</option></select>
            </label>
            <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" data-testid="return-submit">İadeyi kaydet</button></div>
          </form>
        </section>
      )}

      {refund && s.returns.length === 0 && (
        <section className="card no-print">
          <h2>Satışı iptal et</h2>
          <form action={cancelSaleAction} className="actions" data-testid="cancel-sale-form">
            {hidden}
            <input className="oy-input" name="reason" placeholder="İptal nedeni" aria-label="İptal nedeni" maxLength={500} />
            <button className="oy-btn oy-btn--outline" type="submit" data-testid="cancel-sale">İptal et ve geri öde</button>
          </form>
        </section>
      )}
    </>
  );
}
