"use client";

import { useActionState, useEffect, useRef } from "react";
import { scanAction } from "../actions";
import type { ScanResult } from "@/server/stock-count";

/**
 * Barkod okuyucu klavye gibi yazar ve Enter'a basar: her okutma formu gönderir, alan temizlenir ve odak geri gelir.
 * "Adet" boşsa her okutma 1 ekler; "adedi ayarla" seçilirse sayılan adet doğrudan girilen değer olur.
 */
export default function ScanForm({ countId }: { countId: string }) {
  const [state, action, pending] = useActionState<ScanResult | null, FormData>(scanAction, null);
  const code = useRef<HTMLInputElement>(null);
  const qty = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!pending) {
      if (state?.ok) {
        if (code.current) code.current.value = "";
        if (qty.current) qty.current.value = "";
      }
      code.current?.focus();
    }
  }, [state, pending]);
  return (
    <form action={action} className="form-grid" data-testid="scan-form" autoComplete="off">
      <input type="hidden" name="countId" value={countId} />
      <label className="oy-field full">
        <span className="oy-field__label req">Barkod / ürün kodu</span>
        <input ref={code} className="oy-input" name="code" autoFocus required style={{ fontSize: 20 }} aria-label="Barkod" />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Adet</span>
        <input ref={qty} className="oy-input" name="quantity" type="number" min={0} placeholder="1" />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Kip</span>
        <select className="oy-select" name="mode" defaultValue="add">
          <option value="add">Ekle (her okutma +adet)</option>
          <option value="set">Sayılan adedi ayarla</option>
        </select>
      </label>
      <div className="actions full">
        <button className="oy-btn oy-btn--primary" type="submit" disabled={pending} data-testid="scan-submit">
          {pending ? "…" : "Kaydet (Enter)"}
        </button>
      </div>
      {state && (
        <div className={`flash ${state.ok ? "ok" : "err"} full`} role={state.ok ? "status" : "alert"} data-testid={state.ok ? "scan-ok" : "scan-error"}>
          {state.ok ? `${state.message} · fiyat ${state.price?.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺` : state.message}
        </div>
      )}
    </form>
  );
}
