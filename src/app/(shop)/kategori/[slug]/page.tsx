import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryWithDescendants, listCategoryProducts } from "@/server/catalog";
import ProductCard from "@/components/shop/ProductCard";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await categoryWithDescendants(slug);
  if (!found) return { title: "Kategori bulunamadı" };
  const c = found.category;
  return {
    title: c.seoTitle ? { absolute: c.seoTitle } : c.name,
    description: c.seoDescription ?? undefined,
    alternates: { canonical: `/kategori/${c.slug}` },
    openGraph: c.imageUrl ? { images: [c.imageUrl] } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const found = await categoryWithDescendants(slug);
  if (!found) notFound();
  const { category, ids } = found;
  const sort = typeof sp.sirala === "string" ? sp.sirala : "";
  const products = await listCategoryProducts(ids, { sort });

  return (
    <>
      <ol className="oy-crumbs">
        <li>
          <Link href="/">Ana sayfa</Link>
        </li>
        {category.parent && (
          <li>
            <Link href={`/kategori/${category.parent.slug}`}>{category.parent.name}</Link>
          </li>
        )}
        <li aria-current="page">{category.name}</li>
      </ol>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h1 className="h1">{category.name}</h1>
          {category.description && <p style={{ margin: "4px 0 0", maxWidth: 760 }}>{category.description}</p>}
          <p className="muted" style={{ margin: "4px 0 0" }} data-testid="result-count">
            {products.length} ürün
          </p>
        </div>
        <form>
          <label className="muted" htmlFor="sirala">
            Sırala{" "}
          </label>
          <select id="sirala" name="sirala" className="oy-select" defaultValue={sort} style={{ width: "auto", minHeight: 40 }}>
            <option value="">Çok satanlar</option>
            <option value="fiyat-artan">Fiyat: düşükten yükseğe</option>
            <option value="fiyat-azalan">Fiyat: yüksekten düşüğe</option>
            <option value="yeni">En yeniler</option>
          </select>{" "}
          <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">
            Uygula
          </button>
        </form>
      </div>
      {category.children.length > 0 && (
        <nav aria-label="Alt kategoriler" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {category.children.map((c) => (
            <Link key={c.id} href={`/kategori/${c.slug}`} className="oy-btn oy-btn--outline oy-btn--sm">
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {products.length === 0 ? (
        <p className="muted">Bu kategoride şu an yayında ürün yok.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }} data-testid="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </>
  );
}
