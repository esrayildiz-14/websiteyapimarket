import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireAnyStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { formatTL } from "@/lib/money";
import { COUNT_STATUS_LABEL, countReport } from "@/server/stock-count";
import ScanForm from "./ScanForm";
import { approveCountAction, cancelCountAction, removeLineAction, reopenCountAction, submitCountAction } from "../actions";

export const metadata = { title: "Stok sayımı" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CountPage({ params, searchParams }: Props) {
  const user = await requireAnyStaff(["stockcount.write", "stockcount.approve"]);
  const { id } = await params;
  const sp = await searchParams;
  const r = await countReport(id);
  if (!r) notFound();
  const { count: c, lines, missing, summary } = r;
  const write = can(user, "stockcount.write");
  const hidden = <input type="hidden" name="countId" value={c.id} />;
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{c.number}</h1>
          <p>
            <span data-testid="count-status">{COUNT_STATUS_LABEL[c.status]}</span> · {c.warehouse.name}
            {c.fullCount ? " · tam sayım (okutulmayanlar 0 kabul edilir)" : " · kısmi sayım (yalnız okutulanlar)"}
          </p>
        </div>
        <div className="actions"><Link className="oy-btn oy-btn--ghost oy-btn--sm" href="/admin/sayim">← Sayımlar</Link></div>
      </div>
      <Flash sp={sp} />

      {c.status === "OPEN" && write && (
        <section className="card">
          <h2>Okut</h2>
          <ScanForm countId={c.id} />
        </section>
      )}

      <section className="card" data-testid="count-summary">
        <h2>Fark raporu</h2>
        <p>
          Okutulan {summary.scanned} ürün · farklı {summary.withDiff} · fazla <b data-testid="sum-plus">{sign(summary.plus)}</b> · eksik{" "}
          <b data-testid="sum-minus">{summary.minus}</b> · fark tutarı (maliyetle) <b data-testid="sum-value">{formatTL(summary.value)}</b>
          {summary.unvalued ? ` · ${summary.unvalued} üründe maliyet bilinmiyor` : ""}
        </p>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl" data-testid="count-lines">
            <thead><tr><th>Ürün</th><th className="num">Sistem</th><th className="num">Sayılan</th><th className="num">Fark</th><th>Son okutma</th>{c.status === "OPEN" && write && <th />}</tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} data-testid={`count-line-${l.sku}`}>
                  <td>{l.name}<div className="muted">{l.sku}</div></td>
                  <td className="num" data-testid="system">{l.systemQty}</td>
                  <td className="num" data-testid="counted">{l.countedQty}</td>
                  <td className="num"><span className={`pill ${l.diff === 0 ? "off" : l.diff > 0 ? "on" : "err"}`} data-testid="diff">{sign(l.diff)}</span></td>
                  <td className="muted">{l.updatedAt.toLocaleTimeString("tr-TR")}</td>
                  {c.status === "OPEN" && write && (
                    <td><form action={removeLineAction}>{hidden}<input type="hidden" name="lineId" value={l.id} /><button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">Sil</button></form></td>
                  )}
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={6} className="muted">Henüz okutma yok.</td></tr>}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && (
          <>
            <h3>Depoda stoğu olup okutulmayanlar ({missing.length})</h3>
            <p className="muted">Tam sayım seçilirse bunlar onayda 0&apos;a çekilir; kısmi sayımda değişmez.</p>
            <table className="tbl" data-testid="count-missing">
              <tbody>{missing.slice(0, 200).map((m) => <tr key={m.inventoryId}><td>{m.name}<div className="muted">{m.sku}</div></td><td className="num">{m.quantity}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </section>

      <section className="card">
        <div className="actions" style={{ flexWrap: "wrap" }}>
          {c.status === "OPEN" && write && (
            <form action={submitCountAction} className="actions" data-testid="count-submit-form">
              {hidden}
              <label className="oy-check"><input type="checkbox" name="fullCount" /><span>Tam sayım: okutulmayanlar 0 kabul edilsin</span></label>
              <button className="oy-btn oy-btn--secondary" type="submit" data-testid="count-submit">Onaya gönder</button>
            </form>
          )}
          {c.status === "SUBMITTED" && write && (
            <form action={reopenCountAction}>{hidden}<button className="oy-btn oy-btn--outline" type="submit">Sayıma geri dön</button></form>
          )}
          {c.status === "SUBMITTED" && can(user, "stockcount.approve") && (
            <form action={approveCountAction}>{hidden}<button className="oy-btn oy-btn--primary" type="submit" data-testid="count-approve">Onayla ve stoğu düzelt</button></form>
          )}
          {(c.status === "OPEN" || c.status === "SUBMITTED") && write && (
            <form action={cancelCountAction}>{hidden}<button className="oy-btn oy-btn--ghost" type="submit">Sayımı iptal et</button></form>
          )}
        </div>
      </section>
    </>
  );
}
