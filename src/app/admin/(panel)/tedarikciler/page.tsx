import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requireAnyStaff, SUPPLIER_VIEW } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import SupplierFields, { EMPTY_SUPPLIER, SUPPLIER_STATUS } from "./SupplierFields";
import { createSupplierAction } from "./actions";

export const metadata = { title: "Tedarikçiler" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SuppliersPage({ searchParams }: { searchParams: SP }) {
  const user = await requireAnyStaff(SUPPLIER_VIEW);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const suppliers = await prisma.supplier.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q.toUpperCase() } }, { taxNumber: q }] } : {},
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, purchaseOrders: true } } },
    take: 300,
  });
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Tedarikçiler</h1>
          <p>{suppliers.length} tedarikçi</p>
        </div>
        <form className="actions">
          <input className="oy-input" name="q" defaultValue={q} placeholder="Ad, kod veya vergi no" aria-label="Ara" />
          <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">Ara</button>
        </form>
      </div>
      <Flash sp={sp} />
      <div className="tbl-wrap">
        <table className="tbl" data-testid="supplier-table">
          <thead>
            <tr>
              <th>Tedarikçi</th>
              <th>Yetkili / iletişim</th>
              <th className="num">Ürün</th>
              <th className="num">Sipariş</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} data-testid={`supplier-row-${s.code}`}>
                <td>
                  <Link href={`/admin/tedarikciler/${s.id}`} style={{ fontWeight: 600 }}>{s.name}</Link>
                  <div className="muted">{s.code}{s.taxNumber ? ` · VKN ${s.taxNumber}` : ""}</div>
                </td>
                <td className="muted">{[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td>
                <td className="num">{s._count.products}</td>
                <td className="num">{s._count.purchaseOrders}</td>
                <td><span className={`pill ${s.status === "ACTIVE" ? "on" : s.status === "BLOCKED" ? "err" : "off"}`}>{SUPPLIER_STATUS[s.status]}</span></td>
              </tr>
            ))}
            {!suppliers.length && (
              <tr><td colSpan={5} className="muted">Kayıtlı tedarikçi yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {can(user, "supplier.write") && (
        <section className="card">
          <h2>Yeni tedarikçi</h2>
          <ActionForm action={createSupplierAction} testId="supplier-form">
            <SupplierFields v={EMPTY_SUPPLIER} />
            <div className="actions">
              <button className="oy-btn oy-btn--primary" type="submit" data-testid="supplier-submit">Tedarikçiyi kaydet</button>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
