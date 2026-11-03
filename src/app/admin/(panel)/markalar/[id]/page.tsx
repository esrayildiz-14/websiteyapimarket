import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import BrandFields from "../BrandFields";
import { deleteBrandAction, updateBrandAction } from "../actions";

export const metadata = { title: "Marka düzenle" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EditBrandPage({ params, searchParams }: Props) {
  await requireStaff("brand.write");
  const { id } = await params;
  const sp = await searchParams;
  const b = await prisma.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!b) notFound();
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{b.name}</h1>
          <p>{b._count.products} ürün</p>
        </div>
        <div className="actions">
          <Link href="/admin/markalar">‹ Marka listesi</Link>
          <form action={deleteBrandAction} className="inline-form">
            <input type="hidden" name="id" value={b.id} />
            <button className="oy-btn oy-btn--sm" type="submit" style={{ background: "var(--danger)", color: "#fff" }}>
              Markayı sil
            </button>
          </form>
        </div>
      </div>
      <Flash sp={sp} />
      <section className="card">
        <ActionForm action={updateBrandAction.bind(null, b.id)} testId="brand-form" encType="multipart/form-data">
          <BrandFields
            v={{ name: b.name, slug: b.slug, description: b.description ?? "", sortOrder: b.sortOrder, isActive: b.isActive, logoUrl: b.logoUrl }}
          />
          <div className="actions">
            <button className="oy-btn oy-btn--primary" type="submit" data-testid="brand-submit">
              Değişiklikleri kaydet
            </button>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
