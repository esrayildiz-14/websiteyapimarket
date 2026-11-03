import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";

export const metadata = { title: "Müşteri" };

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("customer.read");
  const { id } = await params;
  const c = await prisma.user.findFirst({
    where: { id, type: "CUSTOMER" },
    include: { orders: { orderBy: { createdAt: "desc" } }, addresses: { where: { deletedAt: null }, include: { province: true, district: true } } },
  });
  if (!c) notFound();
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>
            {c.firstName} {c.lastName}
          </h1>
          <p>
            {c.email} · {c.phone ?? "—"} · Kayıt {c.createdAt.toLocaleDateString("tr-TR")} · Son giriş {c.lastLoginAt?.toLocaleString("tr-TR") ?? "—"}
          </p>
        </div>
        <Link href="/admin/musteriler">‹ Müşteri listesi</Link>
      </div>
      <section className="card">
        <h2>Siparişler</h2>
        <table className="tbl">
          <tbody>
            {c.orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/siparisler/${o.id}`}>{o.orderNumber}</Link>
                </td>
                <td>{o.createdAt.toLocaleDateString("tr-TR")}</td>
                <td>{ORDER_STATUS_LABEL[o.status]}</td>
                <td className="num">{formatTL(o.grandTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Adresler</h2>
        <ul>
          {c.addresses.map((a) => (
            <li key={a.id}>
              {a.title}: {a.neighborhood}, {a.line}, {a.postalCode} {a.district.name}/{a.province.name}
            </li>
          ))}
        </ul>
        <p className="muted">Kişisel veriler yalnız sipariş ve destek amacıyla görüntülenir (KVKK). Bu sayfadaki görüntülemeler yetkiyle sınırlıdır.</p>
      </section>
    </>
  );
}
