import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";

export const metadata = { title: "Müşteriler" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const PAID = ["PAID", "PREPARING", "SHIPPED", "DELIVERED"] as const;

export default async function CustomersPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("customer.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const where = {
    type: "CUSTOMER" as const,
    deletedAt: null,
    ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }] } : {}),
  };
  const [total, customers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { orders: true } } } }),
  ]);
  const spent = await prisma.order.groupBy({ by: ["userId"], where: { userId: { in: customers.map((c) => c.id) }, status: { in: [...PAID] } }, _sum: { grandTotal: true } });
  const spentOf = (id: string) => spent.find((s) => s.userId === id)?._sum.grandTotal ?? 0;
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Müşteriler</h1>
          <p>{total} kayıtlı müşteri</p>
        </div>
      </div>
      <form className="toolbar" role="search">
        <input className="oy-input" name="q" defaultValue={q} placeholder="Ad, e-posta veya telefon" aria-label="Ara" style={{ minWidth: 260 }} />
        <button className="oy-btn oy-btn--secondary" type="submit">
          Ara
        </button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl" data-testid="customer-table">
          <thead>
            <tr>
              <th>Müşteri</th>
              <th>Kayıt</th>
              <th className="num">Sipariş</th>
              <th className="num">Ödenmiş tutar</th>
              <th>İzin</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/musteriler/${c.id}`} style={{ fontWeight: 600 }}>
                    {c.firstName} {c.lastName}
                  </Link>
                  <div className="muted">{c.email}</div>
                </td>
                <td>{c.createdAt.toLocaleDateString("tr-TR")}</td>
                <td className="num">{c._count.orders}</td>
                <td className="num">{formatTL(spentOf(c.id))}</td>
                <td>{c.marketingConsent ? <span className="pill on">Ticari ileti izni</span> : <span className="pill off">İzin yok</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
