"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { posTotals, settle } from "@/lib/pos-calc";
import { completeSaleAction, lookupAction } from "./actions";

type Line = { productId: string; variantId: string | null; name: string; sku: string; unitPrice: number; vatRate: number; quantity: number; discount: number; available: number };
const tl = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
const num = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

/** Kasa ekranı. Barkod okuyucu klavye gibi yazar ve Enter'a basar; okutulan ürün sepete eklenir (aynıysa adet artar). */
export default function KasaClient({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cartDiscount, setCartDiscount] = useState("");
  const [card, setCard] = useState("");
  const [cash, setCash] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [done, setDone] = useState<{ id: string; number: string; change: number; total: number } | null>(null);
  const [pending, start] = useTransition();
  const code = useRef<HTMLInputElement>(null);
  useEffect(() => code.current?.focus(), [lines.length, done]);

  const totals = useMemo(() => posTotals(lines, num(cartDiscount)), [lines, cartDiscount]);
  const grand = "error" in totals ? 0 : totals.grandTotal;
  const pay = settle(grand, num(card), num(cash));

  function scan(value: string) {
    const c = value.trim();
    if (!c) return;
    start(async () => {
      const r = await lookupAction(c, warehouseId);
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      if (!r.active) setMsg({ ok: false, text: `${r.name} satışa kapalı (pasif ürün) — yine de eklendi, kontrol edin.` });
      else setMsg({ ok: true, text: `${r.name} · ${tl(r.unitPrice)} · depoda satılabilir ${r.available}` });
      setDone(null);
      setLines((ls) => {
        const i = ls.findIndex((l) => l.productId === r.productId && l.variantId === r.variantId);
        if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1, available: r.available } : l));
        return [...ls, { productId: r.productId, variantId: r.variantId, name: r.name, sku: r.sku, unitPrice: r.unitPrice, vatRate: r.vatRate, quantity: 1, discount: 0, available: r.available }];
      });
      if (code.current) code.current.value = "";
    });
  }

  function complete() {
    start(async () => {
      const r = await completeSaleAction({
        warehouseId, items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, discount: l.discount })),
        cartDiscount: num(cartDiscount), card: num(card), cashGiven: num(cash), customerEmail: customerEmail || undefined, documentNo: documentNo || undefined,
      });
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setDone({ id: r.id, number: r.number, change: r.change, total: r.grandTotal });
      setMsg(null);
      setLines([]);
      setCartDiscount("");
      setCard("");
      setCash("");
      setCustomerEmail("");
      setDocumentNo("");
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="card">
        <div className="form-grid">
          <label className="oy-field">
            <span className="oy-field__label">Satış deposu</span>
            <select className="oy-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={lines.length > 0} aria-label="Satış deposu">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <form
            className="oy-field"
            onSubmit={(e) => {
              e.preventDefault();
              scan(code.current?.value ?? "");
            }}
          >
            <span className="oy-field__label">Barkod / ürün kodu</span>
            <input ref={code} className="oy-input" style={{ fontSize: 22 }} aria-label="Barkod okut" autoComplete="off" autoFocus />
          </form>
        </div>
        {msg && <div className={`flash ${msg.ok ? "ok" : "err"}`} role={msg.ok ? "status" : "alert"} data-testid={msg.ok ? "pos-ok" : "pos-error"}>{msg.text}</div>}
        {done && (
          <div className="flash ok" role="status" data-testid="pos-done">
            Satış tamamlandı: <b>{done.number}</b> · {tl(done.total)}{done.change > 0 ? ` · para üstü ${tl(done.change)}` : ""} ·{" "}
            <Link href={`/admin/kasa/${done.id}`}>fiş / ayrıntı</Link>
          </div>
        )}
      </section>

      <section className="card">
        <table className="tbl" data-testid="pos-cart">
          <thead><tr><th>Ürün</th><th className="num">Fiyat (KDV dahil)</th><th className="num">Adet</th><th className="num">İndirim (₺)</th><th className="num">Tutar</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.productId + (l.variantId ?? "")} data-testid={`pos-line-${l.sku}`}>
                <td>{l.name}<div className="muted">{l.sku}{l.quantity > l.available ? ` · depoda yalnız ${l.available}` : ""}</div></td>
                <td className="num">{tl(l.unitPrice)}</td>
                <td className="num">
                  <input className="oy-input" type="number" min={1} value={l.quantity} aria-label={`${l.sku} adet`} style={{ width: 80 }}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.floor(num(e.target.value)) || 1) } : x)))} />
                </td>
                <td className="num">
                  <input className="oy-input" inputMode="decimal" defaultValue="" aria-label={`${l.sku} indirim`} style={{ width: 90 }}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, discount: num(e.target.value) } : x)))} />
                </td>
                <td className="num" data-testid="line-total">{"error" in totals ? "—" : tl(totals.lines[i].lineTotal)}</td>
                <td><button className="oy-btn oy-btn--ghost oy-btn--sm" type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Sil</button></td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={6} className="muted">Ürün okutun.</td></tr>}
          </tbody>
        </table>
        {"error" in totals && <div className="flash err" role="alert" data-testid="pos-total-error">{totals.error}</div>}
      </section>

      <section className="card">
        <div className="form-grid">
          <label className="oy-field"><span className="oy-field__label">Sepet indirimi (₺)</span><input className="oy-input" inputMode="decimal" value={cartDiscount} onChange={(e) => setCartDiscount(e.target.value)} aria-label="Sepet indirimi" /></label>
          <label className="oy-field"><span className="oy-field__label">Kartla (₺)</span><input className="oy-input" inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} aria-label="Kart tutarı" /></label>
          <label className="oy-field"><span className="oy-field__label">Alınan nakit (₺)</span><input className="oy-input" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} aria-label="Alınan nakit" /></label>
          <label className="oy-field"><span className="oy-field__label">Müşteri e-postası (isteğe bağlı)</span><input className="oy-input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} aria-label="Müşteri e-postası" /></label>
          <label className="oy-field"><span className="oy-field__label">ÖKC fiş / e-arşiv no (isteğe bağlı)</span><input className="oy-input" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} aria-label="Belge no" /></label>
        </div>
        <p style={{ fontSize: 20 }}>
          Toplam: <b data-testid="pos-total">{tl(grand)}</b>
          {!("error" in totals) && totals.discountTotal > 0 ? <span className="muted"> (indirim {tl(totals.discountTotal)})</span> : null}
          {!("error" in pay) && pay.change > 0 ? <> · Para üstü: <b data-testid="pos-change">{tl(pay.change)}</b></> : null}
        </p>
        <p className="muted" style={{ marginTop: 0 }}>Kartlı ödeme ayrı banka POS cihazında çekilir; burada yalnız tahsilat kaydı tutulur. Yasal fiş ÖKC (yazar kasa) veya e-arşiv faturayla düzenlenmelidir.</p>
        <button className="oy-btn oy-btn--primary oy-btn--lg" type="button" data-testid="pos-complete"
          disabled={pending || !lines.length || "error" in totals || "error" in pay} onClick={complete}>
          {pending ? "İşleniyor…" : "Satışı tamamla"}
        </button>
        {lines.length > 0 && "error" in pay && !("error" in totals) && <span className="muted" data-testid="pos-pay-hint" style={{ marginLeft: 12 }}>{pay.error}</span>}
      </section>
    </div>
  );
}
