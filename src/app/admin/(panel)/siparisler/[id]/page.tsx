import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import Flash from "@/components/admin/Flash";
import ShipmentControls from "@/components/admin/ShipmentControls";
import { SHIPMENT_LABEL } from "@/server/shipping-admin";
import { manualTransitions } from "@/server/orders-admin";
import type { AddressSnapshot } from "@/server/address-book";
import { orderNoteAction, orderStatusAction } from "../actions";

export const metadata = { title: "Sipariş detayı" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OrderDetail({ params, searchParams }: Props) {
  const user = await requireStaff("order.read");
  const { id } = await params;
  const sp = await searchParams;
  const o = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: { orderBy: { createdAt: "asc" } },
      shipments: { include: { cargoCompany: true, events: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: true } },
      shippingMethod: true,
      emails: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!o) notFound();
  const companies = await prisma.cargoCompany.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const ship = o.shippingAddress as AddressSnapshot;
  const bill = o.billingAddress as AddressSnapshot;
  const next = manualTransitions(o.status).filter((s) => can(user, s === "CANCELLED" || s === "REFUNDED" ? "order.refund" : "order.update"));
  const Addr = ({ a }: { a: AddressSnapshot }) => (
    <div className="muted">
      {a.fullName} · {a.phone}
      <br />
      {a.neighborhood}, {a.line}
      <br />
      {a.postalCode} {a.district} / {a.province}
    </div>
  );
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{o.orderNumber}</h1>
          <p>
            {o.createdAt.toLocaleString("tr-TR")} ·{" "}
            <span className="pill info" data-testid="order-status">
              {ORDER_STATUS_LABEL[o.status]}
            </span>
          </p>
        </div>
        <Link href="/admin/siparisler">‹ Sipariş listesi</Link>
      </div>
      <Flash sp={sp} />
      {o.adminNote && <div className="flash warn" style={{ whiteSpace: "pre-line" }}>{o.adminNote}</div>}
      <div className="grid-2">
        <section className="card">
          <h2>Müşteri ve adres</h2>
          <p>
            {o.customerName} · {o.customerEmail} · {o.customerPhone}
          </p>
          <b>Teslimat</b>
          <Addr a={ship} />
          <b>Fatura</b>
          <Addr a={bill} />
          {o.customerNote && <p>Not: {o.customerNote}</p>}
        </section>
        <section className="card">
          <h2>Ödeme</h2>
          {o.payments.map((p) => (
            <div key={p.id} className="muted">
              {p.createdAt.toLocaleString("tr-TR")} · {p.provider}
              {p.isTest ? " (TEST)" : ""} · {formatTL(p.amount)} · <b>{p.status}</b>
              {p.providerPaymentId ? ` · ödeme no ${p.providerPaymentId}` : ""}
              {p.errorMessage ? ` · ${p.errorMessage}` : ""}
            </div>
          ))}
          {next.length > 0 && (
            <form action={orderStatusAction} className="form-grid" style={{ marginTop: 12 }} data-testid="order-status-form">
              <input type="hidden" name="id" value={o.id} />
              <label className="oy-field">
                <span className="oy-field__label">Yeni durum</span>
                <select className="oy-select" name="status" defaultValue={next[0]}>
                  {next.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Açıklama</span>
                <input className="oy-input" name="note" maxLength={300} />
              </label>
              {o.status === "RETURN_REQUESTED" && (
                <label className="oy-check">
                  <input type="checkbox" name="restock" defaultChecked />
                  <span>İade ürünleri stoğa geri al</span>
                </label>
              )}
              <div className="actions full">
                <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
                  Durumu güncelle
                </button>
                <span className="muted">İptal ve iadede ödeme iadesi iyzico panelinden ayrıca yapılmalıdır.</span>
              </div>
            </form>
          )}
        </section>
      </div>
      <section className="card">
        <h2>Ürünler</h2>
        <table className="tbl">
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.productId ? <Link href={`/admin/urunler/${i.productId}`}>{i.productName}</Link> : i.productName}
                  {i.variantName ? ` — ${i.variantName}` : ""}
                  <div className="muted">
                    {i.sku} · KDV %{i.vatRate} · {i.shippingProfileCode}
                  </div>
                </td>
                <td className="num">
                  {i.quantity} × {formatTL(i.unitPrice)}
                </td>
                <td className="num">{formatTL(i.lineTotal)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2}>Ara toplam</td>
              <td className="num">{formatTL(o.subtotal)}</td>
            </tr>
            {Number(o.discountTotal) > 0 && (
              <tr>
                <td colSpan={2}>Kupon {o.couponCode}</td>
                <td className="num">−{formatTL(o.discountTotal)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={2}>Kargo ({o.shippingMethod?.name ?? "—"})</td>
              <td className="num">{formatTL(o.shippingTotal)}</td>
            </tr>
            <tr>
              <td colSpan={2}>
                <b>Toplam</b> <span className="muted">(KDV {formatTL(o.vatTotal)})</span>
              </td>
              <td className="num">
                <b>{formatTL(o.grandTotal)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Gönderiler</h2>
        {o.shipments.length === 0 && <p className="muted">Ödeme alınınca kargo paketleri burada oluşur.</p>}
        {o.shipments.map((s) => (
          <div key={s.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <b>{s.description}</b> · {formatTL(s.chargedFee)} · {SHIPMENT_LABEL[s.status]}
            {s.trackingNumber ? ` · ${s.cargoCompany?.name} ${s.trackingNumber}` : ""}
            <ul className="muted">
              {s.events.map((e) => (
                <li key={e.id}>
                  {e.createdAt.toLocaleString("tr-TR")} — {SHIPMENT_LABEL[e.status]}
                  {e.note ? ` (${e.note})` : ""}
                </li>
              ))}
            </ul>
            {can(user, "order.update") && <ShipmentControls shipment={s} companies={companies} back={`/admin/siparisler/${o.id}`} />}
          </div>
        ))}
      </section>
      <div className="grid-2">
        <section className="card">
          <h2>Durum geçmişi</h2>
          <ol>
            {o.statusHistory.map((h) => (
              <li key={h.id}>
                {h.createdAt.toLocaleString("tr-TR")} — {ORDER_STATUS_LABEL[h.toStatus]}
                {h.changedBy ? ` · ${h.changedBy.firstName}` : ""}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h2>Müşteri bildirimleri</h2>
          <ul>
            {o.emails.map((e) => (
              <li key={e.id}>
                {e.createdAt.toLocaleString("tr-TR")} — {e.subject} <span className="muted">({e.status === "LOGGED" ? "kayda yazıldı, gönderilmedi" : e.status})</span>
              </li>
            ))}
          </ul>
          <form action={orderNoteAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="hidden" name="id" value={o.id} />
            <label className="oy-field">
              <span className="oy-field__label">İç not</span>
              <textarea className="oy-input" name="adminNote" rows={3} defaultValue={o.adminNote ?? ""} />
            </label>
            <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit" style={{ alignSelf: "flex-start" }}>
              Notu kaydet
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
