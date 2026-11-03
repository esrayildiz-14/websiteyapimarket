import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import CategoryFields from "../CategoryFields";
import { createCategoryAction } from "../actions";

export const metadata = { title: "Yeni kategori" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function NewCategoryPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("category.write");
  const sp = await searchParams;
  const [mains, profiles] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, defaultShippingProfileId: true } }),
    prisma.shippingProfile.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const parent = mains.find((m) => m.id === sp.ust);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{parent ? `Yeni alt kategori: ${parent.name}` : "Yeni kategori"}</h1>
          <p>Üst kategori seçilmezse ana kategori olarak eklenir.</p>
        </div>
        <Link href="/admin/kategoriler">‹ Kategori listesi</Link>
      </div>
      <ActionForm action={createCategoryAction} testId="category-form" encType="multipart/form-data">
        <CategoryFields
          mains={mains}
          profiles={profiles}
          v={{
            name: "", parentId: parent?.id ?? "", slug: "", description: "", seoTitle: "", seoDescription: "",
            defaultShippingProfileId: parent?.defaultShippingProfileId ?? "", sortOrder: 0, isActive: true, imageUrl: null,
          }}
        />
        <div className="actions">
          <button className="oy-btn oy-btn--primary oy-btn--lg" type="submit" data-testid="category-submit">
            Kategoriyi kaydet
          </button>
        </div>
      </ActionForm>
    </>
  );
}
