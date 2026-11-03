import Link from "next/link";
import type { OrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import Flash from "@/components/admin/Flash";
import { expireStaleOrders } from "@/server/checkout";

export const metadata = { title: "Siparişler" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 30;
const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("order.read");
  await expireStaleOrders();
  const sp = await searchParams;
  const durum = STATUSES.includes(sp.durum as OrderStatus) ? (sp.durum as OrderStatus) : null;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const where = {
    isDemo: false,
    ...(durum ? { status: durum } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q.toUpperCase() } }, { customerEmail: { contains: q.toLowerCase() } }, { customerName: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, orders, counts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { items: true } } } }),
    prisma.order.groupBy({ by: ["status"], where: { isDemo: false }, _count: true }),
  ]);
  const countOf = (s: OrderStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Siparişler</h1>
          <p>{total} sipariş</p>
        </div>
      </div>
      <Flash sp={sp} />
      <nav className="tabs-nav" aria-label="Durum">
        <Link href="/admin/siparisler" aria-current={!durum ? "page" : undefined}>
          Tümü
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/siparisler?durum=${s}`} aria-current={durum === s ? "page" : undefined}>
            {ORDER_STATUS_LABEL[s]} ({countOf(s)})
          </Link>
        ))}
      </nav>
      <form className="toolbar" role="search">
        {durum && <input type="hidden" name="durum" value={durum} />}
        <input className="oy-input" name="q" defaultValue={q} placeholder="Sipariş no, e-posta veya ad" aria-label="Ara" style={{ minWidth: 260 }} />
        <button className="oy-btn oy-btn--secondary" type="submit">
          Ara
        </button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl" data-testid="order-table">
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Tarih</th>
              <th>Müşteri</th>
              <th>İl</th>
              <th className="num">Tutar</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} data-testid={`order-row-${o.orderNumber}`}>
                <td>
                  <Link href={`/admin/siparisler/${o.id}`} style={{ fontWeight: 600 }}>
                    {o.orderNumber}
                  </Link>
                  <div className="muted">{o._count.items} kalem</div>
                </td>
                <td>{o.createdAt.toLocaleString("tr-TR")}</td>
                <td>
                  {o.customerName}
                  <div className="muted">{o.customerEmail}</div>
                </td>
                <td>{(o.shippingAddress as { province?: string })?.province ?? "—"}</td>
                <td className="num">{formatTL(o.grandTotal)}</td>
                <td>
                  <span className={`pill ${["CANCELLED", "REFUNDED"].includes(o.status) ? "err" : o.status === "PENDING_PAYMENT" ? "warn" : o.status === "DELIVERED" ? "on" : "info"}`}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="actions">
          {page > 1 && <Link href={`?${new URLSearchParams({ ...(durum && { durum }), ...(q && { q }), sayfa: String(page - 1) })}`}>‹ Önceki</Link>}
          {page * PAGE < total && <Link href={`?${new URLSearchParams({ ...(durum && { durum }), ...(q && { q }), sayfa: String(page + 1) })}`}>Sonraki ›</Link>}
        </div>
      )}
    </>
  );
}
