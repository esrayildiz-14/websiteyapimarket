import Link from "next/link";
import { formatTL, discountPercent } from "@/lib/money";
import { SALE_UNIT_LABELS } from "@/lib/validation/product";
import type { ProductCardData } from "@/server/catalog";
import { addToCartAction } from "@/app/(shop)/actions";

export default function ProductCard({ p, back }: { p: ProductCardData; back?: string }) {
  const pct = p.discounted ? discountPercent(p.listPrice, p.price) : null;
  return (
    <article className="oy-pcard" data-testid="product-card" data-sku={p.sku}>
      <Link className="oy-pcard__media" href={`/urun/${p.slug}`} aria-label={p.name}>
        <span className="oy-ph">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt={p.imageAlt} style={{ width: "100%", height: "100%", objectFit: "contain" }} loading="lazy" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 16l5-5 4 4 3-3 6 6" />
            </svg>
          )}
        </span>
        <span className="oy-pcard__tags">
          {pct && <span className="oy-badge oy-badge--discount">%{pct}</span>}
          {p.shipping === "AGIR" && <span className="oy-badge oy-badge--heavy">Ağır kargo</span>}
          {p.shipping === "HACIM" && <span className="oy-badge oy-badge--heavy">Hacimli kargo</span>}
        </span>
      </Link>
      {p.brand && <span className="oy-pcard__brand">{p.brand}</span>}
      <Link className="oy-pcard__name" href={`/urun/${p.slug}`}>
        {p.name}
      </Link>
      <span className="oy-pcard__unit">
        Kod: {p.sku} · {SALE_UNIT_LABELS[p.saleUnit as keyof typeof SALE_UNIT_LABELS] ?? p.saleUnit}
      </span>
      <div className="oy-pcard__meta">
        <div className="oy-price">
          <span className={`oy-price__now${p.discounted ? " oy-price__now--sale" : ""}`}>{formatTL(p.price)}</span>
          {p.discounted && <span className="oy-price__old">{formatTL(p.listPrice)}</span>}
        </div>
      </div>
      {p.stockState === "in" && (
        <span className="oy-badge oy-badge--stock">
          <span className="oy-dot" />
          Stokta
        </span>
      )}
      {p.stockState === "low" && (
        <span className="oy-badge oy-badge--low">
          <span className="oy-dot" />
          Son {p.stock} ürün
        </span>
      )}
      {p.stockState === "out" && (
        <span className="oy-badge oy-badge--out">
          <span className="oy-dot" />
          Tükendi
        </span>
      )}
      {p.stockState === "out" ? (
        <span className="oy-btn oy-btn--sm oy-btn--block oy-btn--disabled" aria-disabled="true">
          Tükendi
        </span>
      ) : (
        <form action={addToCartAction}>
          <input type="hidden" name="productId" value={p.id} />
          <input type="hidden" name="qty" value="1" />
          <input type="hidden" name="back" value={back ?? "/sepet"} />
          <button className="oy-btn oy-btn--sm oy-btn--block oy-btn--primary" type="submit" data-testid="card-add">
            Sepete ekle
          </button>
        </form>
      )}
    </article>
  );
}
