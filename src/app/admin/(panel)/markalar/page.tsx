import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import BrandFields from "./BrandFields";
import { createBrandAction } from "./actions";

export const metadata = { title: "Marka yönetimi" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function BrandsPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("brand.write");
  const sp = await searchParams;
  const brands = await prisma.brand.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Marka yönetimi</h1>
          <p>{brands.length} marka</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className="tbl-wrap">
        <table className="tbl" data-testid="brand-table">
          <thead>
            <tr>
              <th aria-label="Logo" />
              <th>Marka</th>
              <th className="num">Ürün</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} data-testid={`brand-row-${b.slug}`}>
                <td>
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={b.logoUrl} alt="" />
                  ) : (
                    <span className="thumb" />
                  )}
                </td>
                <td>
                  <Link href={`/admin/markalar/${b.id}`} style={{ fontWeight: 600 }}>
                    {b.name}
                  </Link>
                  <div className="muted">{b.slug}</div>
                </td>
                <td className="num">{b._count.products}</td>
                <td>
                  <span className={`pill ${b.isActive ? "on" : "off"}`}>{b.isActive ? "Aktif" : "Pasif"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card">
        <h2>Yeni marka ekle</h2>
        <ActionForm action={createBrandAction} testId="brand-form" encType="multipart/form-data">
          <BrandFields v={{ name: "", slug: "", description: "", sortOrder: 0, isActive: true, logoUrl: null }} />
          <div className="actions">
            <button className="oy-btn oy-btn--primary" type="submit" data-testid="brand-submit">
              Markayı kaydet
            </button>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
