import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requireAnyStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { COUNT_STATUS_LABEL } from "@/server/stock-count";
import { startCountAction } from "./actions";

export const metadata = { title: "Stok sayımı" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CountsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireAnyStaff(["stockcount.write", "stockcount.approve"]);
  const sp = await searchParams;
  const [counts, warehouses] = await Promise.all([
    prisma.stockCount.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { warehouse: true, _count: { select: { lines: true } } } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] }),
  ]);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Stok sayımı</h1>
          <p>Ürünleri barkodla okutun; fark raporunu inceleyin; başka bir yetkili onaylayınca stok düzeltilir. Geçmiş hareketler silinmez.</p>
        </div>
      </div>
      <Flash sp={sp} />
      {can(user, "stockcount.write") && (
        <section className="card">
          <h2>Yeni sayım</h2>
          <form action={startCountAction} className="form-grid" data-testid="count-start-form">
            <label className="oy-field">
              <span className="oy-field__label req">Depo</span>
              <select className="oy-select" name="warehouseId" defaultValue={warehouses[0]?.id}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="oy-field">
              <span className="oy-field__label">Not</span>
              <input className="oy-input" name="note" maxLength={500} placeholder="Ör. yıl sonu sayımı, A rafı" />
            </label>
            <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" data-testid="count-start">Sayımı başlat</button></div>
          </form>
        </section>
      )}
      <div className="tbl-wrap">
        <table className="tbl" data-testid="count-table">
          <thead><tr><th>No</th><th>Depo</th><th>Durum</th><th className="num">Okutulan ürün</th><th>Başlangıç</th></tr></thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.id} data-testid={`count-row-${c.number}`}>
                <td><Link href={`/admin/sayim/${c.id}`} style={{ fontWeight: 600 }}>{c.number}</Link>{c.note ? <div className="muted">{c.note}</div> : null}</td>
                <td>{c.warehouse.name}</td>
                <td>{COUNT_STATUS_LABEL[c.status]}</td>
                <td className="num">{c._count.lines}</td>
                <td>{c.createdAt.toLocaleString("tr-TR")}</td>
              </tr>
            ))}
            {!counts.length && <tr><td colSpan={5} className="muted">Sayım yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
