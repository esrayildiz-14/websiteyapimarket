import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth/customer";
import { formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import AddressForm from "@/components/shop/AddressForm";
import { PasswordForm, ProfileForm } from "@/components/shop/AccountForms";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { customerLogoutAction, deleteAddressAction } from "../actions";

export const metadata = { title: "Hesabım", robots: { index: false } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: SP }) {
  const c = await requireCustomer("/hesabim");
  const sp = await searchParams;
  const [orders, addresses, provinces] = await Promise.all([
    prisma.order.findMany({ where: { userId: c.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.address.findMany({ where: { userId: c.id, deletedAt: null }, include: { province: true, district: true }, orderBy: { createdAt: "asc" } }),
    prisma.province.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1 className="h1">Hesabım</h1>
          <p data-testid="customer-name">
            {c.firstName} {c.lastName} · {c.email}
          </p>
        </div>
        <form action={customerLogoutAction}>
          <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">
            Çıkış yap
          </button>
        </form>
      </div>
      <Flash sp={sp} />
      <section className="card">
        <h2>Siparişlerim</h2>
        {orders.length === 0 ? (
          <p className="muted">Henüz siparişiniz yok.</p>
        ) : (
          <table className="tbl" data-testid="my-orders">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/siparis-takip?no=${o.orderNumber}`} style={{ fontWeight: 600 }} data-testid={`my-order-${o.orderNumber}`}>
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td>{o.createdAt.toLocaleDateString("tr-TR")}</td>
                  <td>{ORDER_STATUS_LABEL[o.status]}</td>
                  <td className="num">{formatTL(o.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>Üyelik bilgilerim</h2>
        <ProfileForm v={{ firstName: c.firstName, lastName: c.lastName, phone: c.phone ?? "" }} />
      </section>
      <section className="card">
        <h2>Şifre değiştir</h2>
        <PasswordForm />
      </section>
      <section className="card">
        <h2>Adreslerim</h2>
        <div className="grid-3">
          {addresses.map((a) => (
            <div key={a.id} className="card" style={{ padding: 14 }} data-testid="address-card">
              <b>{a.title}</b>
              <div>{a.fullName}</div>
              <div className="muted">
                {a.neighborhood}, {a.line}
                <br />
                {a.postalCode} {a.district.name} / {a.province.name}
                <br />
                {a.phone}
              </div>
              <form action={deleteAddressAction}>
                <input type="hidden" name="id" value={a.id} />
                <button className="danger-link" type="submit" style={{ fontSize: 13 }}>
                  Sil
                </button>
              </form>
            </div>
          ))}
        </div>
        <h3 style={{ marginTop: 16 }}>Yeni adres</h3>
        <AddressForm provinces={provinces} next={typeof sp.devam === "string" ? sp.devam : "/hesabim"} defaults={{ fullName: `${c.firstName} ${c.lastName}`, phone: c.phone ?? "" }} />
      </section>
    </>
  );
}
