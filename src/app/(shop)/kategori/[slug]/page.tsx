import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryWithDescendants, listOptionsFrom, listProducts } from "@/server/catalog";
import ProductListing from "@/components/shop/ProductListing";
import { fallbackDescription, OG_BASE, siteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await categoryWithDescendants(slug);
  if (!found) return { title: "Kategori bulunamadı" };
  const c = found.category;
  return {
    title: c.seoTitle ? { absolute: c.seoTitle } : c.name,
    description: c.seoDescription ?? c.description?.slice(0, 160) ?? fallbackDescription(c.name, [found.category.parent?.name, "yapı market ürünleri"]),
    alternates: { canonical: `/kategori/${c.slug}` },
    openGraph: { ...OG_BASE, title: c.seoTitle ?? c.name, ...(c.imageUrl ? { images: [c.imageUrl] } : {}) },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const found = await categoryWithDescendants(slug);
  if (!found) notFound();
  const { category, ids } = found;
  const r = await listProducts(ids, listOptionsFrom(sp));

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
        </div>
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
      <ProductListing r={r} path={`/kategori/${category.slug}`} sp={sp} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Ana sayfa", item: siteUrl() + "/" },
              ...(category.parent ? [{ "@type": "ListItem", position: 2, name: category.parent.name, item: `${siteUrl()}/kategori/${category.parent.slug}` }] : []),
              { "@type": "ListItem", position: category.parent ? 3 : 2, name: category.name, item: `${siteUrl()}/kategori/${category.slug}` },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
