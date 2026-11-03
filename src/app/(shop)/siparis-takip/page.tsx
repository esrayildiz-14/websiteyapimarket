import { prisma } from "@/lib/prisma";
import { formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { SHIPMENT_LABEL } from "@/server/shipping-admin";
import { trackingLink } from "@/server/email";
import { trackOrderAction } from "../actions";

export const metadata = { title: "Sipariş takip", robots: { index: false } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function TrackPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const no = typeof sp.no === "string" ? sp.no.toUpperCase() : "";
  const e = typeof sp.e === "string" ? sp.e.toLowerCase() : "";
  const o =
    no && e
      ? await prisma.order.findFirst({
          where: { orderNumber: no, customerEmail: e },
          include: {
            items: true,
            statusHistory: { orderBy: { createdAt: "asc" } },
            shipments: { include: { cargoCompany: true, events: { orderBy: { createdAt: "asc" } } } },
          },
        })
      : null;
  return (
    <>
      <h1 className="h1">Sipariş takip</h1>
      <Flash sp={sp} />
      <form action={trackOrderAction} className="toolbar card" data-testid="track-form">
        <label className="oy-field">
          <span className="oy-field__label">Sipariş numarası</span>
          <input className="oy-input" name="no" defaultValue={no} required />
        </label>
        <label className="oy-field">
          <span className="oy-field__label">E-posta</span>
          <input className="oy-input" name="email" type="email" defaultValue={e} required />
        </label>
        <button className="oy-btn oy-btn--secondary" type="submit">
          Sorgula
        </button>
      </form>
      {no && e && !o && <div className="flash err">Sipariş bulunamadı. Sipariş numarası ve e-posta adresini kontrol edin.</div>}
      {o && (
        <section className="card" data-testid="track-result">
          <h2>
            {o.orderNumber} · <span data-testid="track-status">{ORDER_STATUS_LABEL[o.status]}</span>
          </h2>
          <p className="muted">
            {o.createdAt.toLocaleString("tr-TR")} · {formatTL(o.grandTotal)}
          </p>
          <ol>
            {o.statusHistory.map((h) => (
              <li key={h.id}>
                {h.createdAt.toLocaleString("tr-TR")} — {ORDER_STATUS_LABEL[h.toStatus]}
              </li>
            ))}
          </ol>
          {o.shipments.map((s) => {
            const link = trackingLink(s.cargoCompany?.trackingUrlTemplate, s.trackingNumber);
            return (
              <div key={s.id} className="card" style={{ marginTop: 12 }} data-testid="track-shipment">
                <b>{s.description}</b> · <span data-testid="track-shipment-status">{SHIPMENT_LABEL[s.status]}</span>
                {s.trackingNumber && (
                  <div>
                    {s.cargoCompany?.name} · Takip no: <b data-testid="track-number">{s.trackingNumber}</b>{" "}
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer">
                        Kargo firmasında izle ↗
                      </a>
                    )}
                  </div>
                )}
                <ul className="muted">
                  {s.events.map((ev) => (
                    <li key={ev.id}>
                      {ev.createdAt.toLocaleString("tr-TR")} — {SHIPMENT_LABEL[ev.status]}
                      {ev.note ? ` (${ev.note})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
