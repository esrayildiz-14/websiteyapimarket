import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { formatTL } from "@/lib/money";
import KasaClient from "./KasaClient";
import { istanbulDayStart } from "@/lib/report-calc";

export const metadata = { title: "Mağaza kasası" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function KasaPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("pos.sell");
  const sp = await searchParams;
  const dayStart = istanbulDayStart(new Date());
  const [warehouses, today] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], select: { id: true, name: true } }),
    prisma.storeSale.findMany({ where: { createdAt: { gte: dayStart } }, orderBy: { createdAt: "desc" }, include: { payments: true } }),
  ]);
  const paid = (m: "CASH" | "CARD") => today.flatMap((s) => s.payments).filter((p) => p.method === m).reduce((a, p) => a + Number(p.amount), 0);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Mağaza kasası</h1>
          <p>Bugün {today.filter((s) => s.status === "COMPLETED").length} satış · nakit <b data-testid="day-cash">{formatTL(paid("CASH"))}</b> · kart <b data-testid="day-card">{formatTL(paid("CARD"))}</b> (iade ve iptaller düşülmüş)</p>
        </div>
      </div>
      <Flash sp={sp} />
      <KasaClient warehouses={warehouses} />
      <section className="card">
        <h2>Bugünkü satışlar</h2>
        <table className="tbl" data-testid="pos-today">
          <thead><tr><th>No</th><th>Saat</th><th>Durum</th><th className="num">Toplam</th><th className="num">İade</th></tr></thead>
          <tbody>
            {today.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/admin/kasa/${s.id}`}>{s.number}</Link></td>
                <td>{s.createdAt.toLocaleTimeString("tr-TR")}</td>
                <td>{s.status === "COMPLETED" ? "Tamamlandı" : "İptal"}</td>
                <td className="num">{formatTL(s.grandTotal)}</td>
                <td className="num">{Number(s.refundedTotal) ? formatTL(s.refundedTotal) : "—"}</td>
              </tr>
            ))}
            {!today.length && <tr><td colSpan={5} className="muted">Bugün satış yok.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
