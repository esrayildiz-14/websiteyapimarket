import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { activeDiscounts, toCard, VISIBLE } from "@/server/catalog";
import { addToCartAction } from "../../actions";
import Flash from "@/components/admin/Flash";
import { fallbackDescription, OG_BASE, siteUrl } from "@/lib/site";
import { isInternalBarcode } from "@/lib/barcode";
import { discountPercent, formatTL } from "@/lib/money";
import { SALE_UNIT_LABELS } from "@/lib/validation/product";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(slug: string) {
  return prisma.product.findFirst({
    where: { ...VISIBLE, slug },
    include: { brand: true, category: { include: { parent: true } }, images: { orderBy: { sortOrder: "asc" } }, shippingProfile: true, inventory: true },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return { title: "Ürün bulunamadı" };
  const description = p.seoDescription ?? p.shortDescription ?? fallbackDescription(p.name, [p.brand?.name, p.category.parent?.name, p.category.name]);
  return {
    title: p.seoTitle || p.name,
    description,
    alternates: { canonical: `/urun/${p.slug}` },
    openGraph: { ...OG_BASE, title: p.seoTitle || p.name, description, url: `/urun/${p.slug}`, images: p.images[0] ? [{ url: p.images[0].url, alt: p.images[0].alt ?? p.name }] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const p = await load((await params).slug);
  const sp = await searchParams;
  if (!p) notFound();
  const card = toCard(p, await activeDiscounts());
  const pct = card.discounted ? discountPercent(card.listPrice, card.price) : null;
  const specs = Array.isArray(p.specs) ? (p.specs as { label: string; value: string }[]) : [];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd(p, card) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { name: "Ana sayfa", item: siteUrl() + "/" },
              ...(p.category.parent ? [{ name: p.category.parent.name, item: `${siteUrl()}/kategori/${p.category.parent.slug}` }] : []),
              { name: p.category.name, item: `${siteUrl()}/kategori/${p.category.slug}` },
              { name: p.name, item: `${siteUrl()}/urun/${p.slug}` },
            ].map((x, i) => ({ "@type": "ListItem", position: i + 1, ...x })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <Flash sp={sp} />
      <ol className="oy-crumbs">
        <li>
          <Link href="/">Ana sayfa</Link>
        </li>
        {p.category.parent && (
          <li>
            <Link href={`/kategori/${p.category.parent.slug}`}>{p.category.parent.name}</Link>
          </li>
        )}
        <li>
          <Link href={`/kategori/${p.category.slug}`}>{p.category.name}</Link>
        </li>
        <li aria-current="page">{p.name}</li>
      </ol>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="oy-ph" style={{ borderRadius: 16 }}>
            {p.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0].url} alt={p.images[0].alt ?? p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            )}
          </div>
          {p.images.length > 1 && (
            <div className="img-grid">
              {p.images.slice(1).map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt={img.alt ?? ""} style={{ aspectRatio: "1/1", objectFit: "contain", background: "var(--surface-alt)", borderRadius: 8 }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 16 }}>
          {p.brand && <span className="oy-pcard__brand">{p.brand.name}</span>}
          <h1 className="h1" data-testid="product-name">
            {p.name}
          </h1>
          <span className="muted">
            Ürün kodu: {p.sku}
            {p.barcode ? ` · Barkod: ${p.barcode}` : ""}
          </span>
          <div className="oy-price" style={{ gap: "0 12px" }}>
            <span className={`oy-price__now${card.discounted ? " oy-price__now--sale" : ""}`} style={{ fontSize: 34, lineHeight: "38px" }} data-testid="product-price">
              {formatTL(card.price)}
            </span>
            {card.discounted && <span className="oy-price__old">{formatTL(card.listPrice)}</span>}
            {pct && <span className="oy-badge oy-badge--discount">%{pct}</span>}
            <span className="oy-price__note">
              KDV (%{p.vatRate}) dahil · Satış birimi: {SALE_UNIT_LABELS[p.saleUnit]}
            </span>
          </div>
          <span className={`oy-badge oy-badge--${card.stockState === "in" ? "stock" : card.stockState}`}>
            <span className="oy-dot" />
            {card.stockState === "out" ? "Tükendi" : card.stockState === "low" ? `Son ${card.stock} ürün` : "Stokta"}
          </span>
          <span className="oy-ship">
            {p.shippingProfile.name} kargo · {p.handlingDays} iş günü içinde kargoda, {p.shippingProfile.transitDaysMin}–{p.shippingProfile.transitDaysMax} iş günü yolda
            {p.shippingProfile.deliveryNote ? ` · ${p.shippingProfile.deliveryNote}` : ""}
          </span>
          {p.shortDescription && <p style={{ margin: 0 }}>{p.shortDescription}</p>}
          {card.stockState !== "out" ? (
            <form action={addToCartAction} className="actions" data-testid="add-to-cart">
              <input type="hidden" name="productId" value={p.id} />
              <input type="hidden" name="back" value={`/urun/${p.slug}`} />
              <label className="muted" htmlFor="qty">
                Adet
              </label>
              <input id="qty" className="oy-input" name="qty" type="number" min={1} max={Math.min(999, card.stock)} defaultValue={1} style={{ width: 90 }} />
              <button className="oy-btn oy-btn--primary oy-btn--lg" type="submit" name="go" value="sepet">
                Sepete ekle
              </button>
            </form>
          ) : (
            <span className="oy-btn oy-btn--disabled oy-btn--lg" aria-disabled="true">
              Tükendi
            </span>
          )}
        </div>
      </div>
      {p.description && (
        <section>
          <h2 className="h3">Açıklama</h2>
          <p style={{ whiteSpace: "pre-line", maxWidth: 860 }}>{p.description}</p>
        </section>
      )}
      {specs.length > 0 && (
        <section style={{ maxWidth: 860 }}>
          <h2 className="h3" style={{ marginBottom: 8 }}>
            Teknik özellikler
          </h2>
          <table className="tbl" data-testid="spec-table">
            <tbody>
              {specs.map((s, i) => (
                <tr key={i}>
                  <th scope="row" style={{ textTransform: "none", fontSize: 14, color: "var(--ink)", background: "none", width: "40%" }}>
                    {s.label}
                  </th>
                  <td>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/** Ürün yapılandırılmış verisi (schema.org/Product). Yalnız veritabanındaki doğrulanmış alanlar kullanılır. */
function productJsonLd(
  p: { name: string; slug: string; sku: string; barcode: string | null; model: string | null; description: string | null; shortDescription: string | null; brand: { name: string } | null; images: { url: string }[] },
  card: { price: number; stockState: string },
) {
  const base = siteUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    ...(p.barcode && !isInternalBarcode(p.barcode) ? { gtin: p.barcode } : {}),
    ...(p.model ? { model: p.model } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand.name } } : {}),
    ...(p.shortDescription || p.description ? { description: (p.shortDescription || p.description || "").slice(0, 500) } : {}),
    ...(p.images.length ? { image: p.images.map((i) => base + i.url) } : {}),
    offers: {
      "@type": "Offer",
      url: `${base}/urun/${p.slug}`,
      priceCurrency: "TRY",
      price: card.price.toFixed(2),
      availability: card.stockState === "out" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      shippingDetails: { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "TR" } },
    },
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
