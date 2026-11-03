"use client";

import { useActionState, useTransition } from "react";
import { importAction, type ImportState } from "./actions";

export default function ImportForm() {
  const [s, action] = useActionState<ImportState, FormData>(importAction, {});
  const [pending, start] = useTransition();
  const errors = s.results?.filter((r) => r.action === "error").length ?? 0;
  const ok = (s.results?.length ?? 0) - errors;
  return (
    <form
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      data-testid="import-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("mode", (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "check");
        start(() => action(fd));
      }}
    >
      <label className="oy-field">
        <span className="oy-field__label req">Excel dosyası (.xlsx)</span>
        <input className="oy-input" type="file" name="file" accept=".xlsx" style={{ paddingTop: 8 }} />
      </label>
      <div className="actions">
        <button className="oy-btn oy-btn--secondary" type="submit" value="check" disabled={pending} data-testid="import-check">
          Kontrol et
        </button>
        <button className="oy-btn oy-btn--primary" type="submit" value="apply" disabled={pending} data-testid="import-apply">
          İçe aktar
        </button>
        {pending && <span className="muted">İşleniyor…</span>}
      </div>
      {s.message && (
        <div className="flash err" role="alert" data-testid="import-error">
          {s.message}
        </div>
      )}
      {s.results && (
        <>
          <div className={`flash ${errors ? "warn" : "ok"}`} data-testid="import-summary">
            {s.applied ? "İçe aktarıldı" : "Kontrol sonucu"}: {ok} satır {s.applied ? "kaydedildi" : "geçerli"}, {errors} satır hatalı.
          </div>
          <table className="tbl" data-testid="import-results">
            <thead>
              <tr>
                <th>Satır</th>
                <th>Ürün kodu</th>
                <th>Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {s.results.map((r) => (
                <tr key={r.row}>
                  <td>{r.row}</td>
                  <td>{r.sku}</td>
                  <td style={{ color: r.action === "error" ? "var(--danger)" : undefined }}>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </form>
  );
}
