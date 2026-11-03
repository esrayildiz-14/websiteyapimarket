import type { ShipmentStatus } from "@/generated/prisma/client";
import { allowedShipmentTransitions, SHIPMENT_LABEL } from "@/server/shipping-admin";
import { shipmentAction } from "@/app/admin/(panel)/kargo/actions";

/** Bir gönderi için durum ilerletme formu (kargo listesi ve sipariş detayında ortak). */
export default function ShipmentControls({
  shipment,
  companies,
  back,
}: {
  shipment: { id: string; status: ShipmentStatus; cargoCompanyId: string | null; trackingNumber: string | null };
  companies: { id: string; name: string }[];
  back: string;
}) {
  const next = allowedShipmentTransitions(shipment.status);
  if (!next.length) return <span className="muted">İşlem yok</span>;
  return (
    <form action={shipmentAction} className="actions" data-testid={`shipment-form-${shipment.id}`}>
      <input type="hidden" name="shipmentId" value={shipment.id} />
      <input type="hidden" name="back" value={back} />
      {shipment.status === "PREPARING" && (
        <>
          <select className="oy-select" name="cargoCompanyId" defaultValue={shipment.cargoCompanyId ?? ""} aria-label="Kargo firması" style={{ width: 160 }}>
            <option value="">Firma seçin</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input className="oy-input" name="trackingNumber" defaultValue={shipment.trackingNumber ?? ""} placeholder="Takip numarası" aria-label="Takip numarası" style={{ width: 170 }} />
        </>
      )}
      <select className="oy-select" name="status" defaultValue={next[0]} aria-label="Yeni durum" style={{ width: 170 }}>
        {next.map((s) => (
          <option key={s} value={s}>
            {SHIPMENT_LABEL[s]}
          </option>
        ))}
      </select>
      <input className="oy-input" name="note" placeholder="Not (isteğe bağlı)" aria-label="Not" style={{ width: 160 }} />
      <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
        Güncelle
      </button>
    </form>
  );
}
