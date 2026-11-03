import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import CategoryFields from "../CategoryFields";
import { deleteCategoryAction, updateCategoryAction } from "../actions";

export const metadata = { title: "Kategori düzenle" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EditCategoryPage({ params, searchParams }: Props) {
  await requireStaff("category.write");
  const { id } = await params;
  const sp = await searchParams;
  const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } }, parent: true } });
  if (!c) notFound();
  const [mains, profiles] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null, NOT: { id } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.shippingProfile.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{c.name}</h1>
          <p>
            {c.parent ? `Alt kategori · ${c.parent.name}` : "Ana kategori"} · {c._count.products} ürün
            {c._count.children ? ` · ${c._count.children} alt kategori` : ""} ·{" "}
            <Link href={`/kategori/${c.slug}`} target="_blank">
              Sitede görüntüle ↗
            </Link>
          </p>
        </div>
        <div className="actions">
          <Link href="/admin/kategoriler">‹ Kategori listesi</Link>
          <form action={deleteCategoryAction} className="inline-form">
            <input type="hidden" name="id" value={c.id} />
            <button className="oy-btn oy-btn--sm" type="submit" style={{ background: "var(--danger)", color: "#fff" }}>
              Kategoriyi sil
            </button>
          </form>
        </div>
      </div>
      <Flash sp={sp} />
      <ActionForm action={updateCategoryAction.bind(null, c.id)} testId="category-form" encType="multipart/form-data">
        <CategoryFields
          mains={mains}
          profiles={profiles}
          lockParent={c._count.children ? "Alt kategorileri olduğu için bu kategori başka bir kategorinin altına taşınamaz." : undefined}
          v={{
            name: c.name, parentId: c.parentId ?? "", slug: c.slug, description: c.description ?? "", seoTitle: c.seoTitle ?? "",
            seoDescription: c.seoDescription ?? "", defaultShippingProfileId: c.defaultShippingProfileId ?? "", sortOrder: c.sortOrder,
            isActive: c.isActive, imageUrl: c.imageUrl,
          }}
        />
        <div className="actions">
          <button className="oy-btn oy-btn--primary oy-btn--lg" type="submit" data-testid="category-submit">
            Değişiklikleri kaydet
          </button>
        </div>
      </ActionForm>
    </>
  );
}
