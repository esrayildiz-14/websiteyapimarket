import Link from "next/link";
import { formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import { cartView } from "@/server/cart";
import { expireStaleOrders } from "@/server/checkout";
import { removeItemAction, setQtyAction } from "../actions";

export const metadata = { title: "Sepetim", robots: { index: false } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CartPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await expireStaleOrders();
  const v = await cartView();
  return (
    <>
      <h1 className="h1">Sepetim</h1>
      <Flash sp={sp} />
      {v.lines.length === 0 ? (
        <div className="card" data-testid="cart-empty">
          Sepetiniz boş. <Link href="/urunler">Ürünlere göz atın</Link>.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", alignItems: "start" }}>
          <div className="tbl-wrap" style={{ gridColumn: "span 2" }}>
            <table className="tbl" data-testid="cart-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th className="num">Birim fiyat</th>
                  <th>Adet</th>
                  <th className="num">Tutar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l) => (
                  <tr key={l.id} data-testid={`cart-line-${l.sku}`}>
                    <td>
                      <Link href={`/urun/${l.slug}`} style={{ fontWeight: 600 }}>
                        {l.name}
                      </Link>
                      {l.variantName && <div className="muted">{l.variantName}</div>}
                      <div className="muted">
                        {l.sku}
                        {l.profileCode !== "STD" ? ` · ${l.profileCode === "AGIR" ? "Ağır kargo" : "Hacimli kargo"}` : ""}
                        {l.freeShipping ? " · Ücretsiz kargo" : ""}
                      </div>
                      {l.problem && (
                        <div className="oy-field__error" data-testid="line-problem">
                          {l.problem}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {formatTL(l.unitPrice)}
                      {l.listPrice > l.unitPrice && <div className="muted" style={{ textDecoration: "line-through" }}>{formatTL(l.listPrice)}</div>}
                    </td>
                    <td>
                      <form action={setQtyAction} className="actions">
                        <input type="hidden" name="itemId" value={l.id} />
                        <input className="oy-input" name="qty" type="number" min={0} max={999} defaultValue={l.quantity} aria-label={`${l.name} adet`} style={{ width: 80 }} />
                        <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">
                          Güncelle
                        </button>
                      </form>
                    </td>
                    <td className="num" data-testid="line-total">
                      {formatTL(l.lineTotal)}
                    </td>
                    <td>
                      <form action={removeItemAction}>
                        <input type="hidden" name="itemId" value={l.id} />
                        <button className="danger-link" type="submit" aria-label={`${l.name} sepetten çıkar`}>
                          Sil
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="card" data-testid="cart-summary" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2>Sipariş özeti</h2>
            <Row label="Ürünler" value={formatTL(v.subtotal)} testId="sum-subtotal" />
            {v.campaignSavings > 0 && <Row label="Kampanya kazancınız" value={`−${formatTL(v.campaignSavings)}`} muted />}
            {v.shipping.packages.map((p, i) => (
              <Row key={i} label={p.description} value={p.free ? "Ücretsiz" : formatTL(p.fee)} muted />
            ))}
            {v.shipping.methodFee > 0 && <Row label="Teslimat yöntemi ek ücreti" value={formatTL(v.shipping.methodFee)} muted />}
            <Row label="Kargo" value={v.shipping.total === 0 && v.okLines.length ? "Ücretsiz" : formatTL(v.shipping.total)} testId="sum-shipping" />
            {v.shipping.remainingForFree > 0 && (
              <div className="muted">Standart kargoda ücretsiz gönderim için {formatTL(v.shipping.remainingForFree)} daha ekleyin.</div>
            )}
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
            <Row label="Toplam (KDV dahil)" value={formatTL(v.grandTotal)} strong testId="sum-total" />
            <div className="muted">İçindeki KDV: {formatTL(v.vatTotal)}</div>
            {v.hasProblems && <div className="flash warn">Sorunlu satırlar ödeme toplamına katılmaz. Adedi düzeltin veya ürünü sepetten çıkarın.</div>}
            <Link
              className={`oy-btn oy-btn--primary oy-btn--block${v.okLines.length ? "" : " oy-btn--disabled"}`}
              href={v.okLines.length && !v.hasProblems ? "/odeme" : "/sepet"}
              aria-disabled={!v.okLines.length || v.hasProblems}
              data-testid="go-checkout"
            >
              Alışverişi tamamla
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}

function Row({ label, value, strong, muted, testId }: { label: string; value: string; strong?: boolean; muted?: boolean; testId?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: strong ? 700 : 400, fontSize: muted ? 13 : 15, color: muted ? "var(--ink-muted)" : undefined }}>
      <span>{label}</span>
      <span data-testid={testId}>{value}</span>
    </div>
  );
}
