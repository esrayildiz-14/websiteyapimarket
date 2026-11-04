import Link from "next/link";
import ProductCard from "./ProductCard";
import type { listProducts } from "@/server/catalog";

type Result = Awaited<ReturnType<typeof listProducts>>;
type SP = Record<string, string | string[] | undefined>;

/** Ürün listesi: filtre formu (GET, JavaScript gerektirmez), toplam sonuç, ürün ızgarası ve sayfalama. */
export default function ProductListing({ r, path, sp, hidden = {} }: { r: Result; path: string; sp: SP; hidden?: Record<string, string> }) {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const selected = new Set((Array.isArray(sp.marka) ? sp.marka : s("marka").split(",")).filter(Boolean));
  const href = (page: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "sayfa") u.set(k, v);
    if (Array.isArray(sp.marka)) u.set("marka", sp.marka.join(","));
    if (page > 1) u.set("sayfa", String(page));
    const q = u.toString();
    return q ? `${path}?${q}` : path;
  };
  const back = href(r.page);
  const from = r.total ? (r.page - 1) * r.perPage + 1 : 0;
  const to = Math.min(r.total, r.page * r.perPage);
  return (
    <>
      <form method="get" action={path} className="card" data-testid="filter-form" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", padding: 14 }}>
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="oy-field" style={{ minWidth: 180 }}>
          <span className="oy-field__label">Sırala</span>
          <select className="oy-select" name="sirala" defaultValue={s("sirala")}>
            <option value="">Çok satanlar</option>
            <option value="fiyat-artan">Fiyat: düşükten yükseğe</option>
            <option value="fiyat-azalan">Fiyat: yüksekten düşüğe</option>
            <option value="yeni">En yeniler</option>
          </select>
        </label>
        <label className="oy-field" style={{ width: 120 }}>
          <span className="oy-field__label">En az ₺</span>
          <input className="oy-input" name="min" inputMode="decimal" defaultValue={s("min")} placeholder={r.priceRange ? String(Math.floor(r.priceRange.min)) : ""} />
        </label>
        <label className="oy-field" style={{ width: 120 }}>
          <span className="oy-field__label">En çok ₺</span>
          <input className="oy-input" name="max" inputMode="decimal" defaultValue={s("max")} placeholder={r.priceRange ? String(Math.ceil(r.priceRange.max)) : ""} />
        </label>
        <label className="oy-check" style={{ minHeight: 44 }}>
          <input type="checkbox" name="stokta" value="1" defaultChecked={s("stokta") === "1"} />
          <span>Yalnız stokta olanlar</span>
        </label>
        {r.brands.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }} aria-label="Marka">
            {r.brands.slice(0, 30).map((b) => (
              <label key={b.id} className="oy-check">
                <input type="checkbox" name="marka" value={b.id} defaultChecked={selected.has(b.id)} />
                <span>{b.name} ({b.count})</span>
              </label>
            ))}
          </fieldset>
        )}
        <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit" data-testid="filter-submit">Uygula</button>
        {(s("min") || s("max") || s("stokta") || selected.size > 0) && (
          <Link className="oy-btn oy-btn--ghost oy-btn--sm" href={Object.keys(hidden).length ? `${path}?${new URLSearchParams(hidden)}` : path}>Filtreleri temizle</Link>
        )}
      </form>
      <p className="muted" data-testid="result-count" style={{ margin: 0 }}>
        {r.total === 0 ? "0 ürün" : `${r.total} ürün${r.pages > 1 ? ` · ${from}–${to} arası gösteriliyor` : ""}`}
      </p>
      {r.items.length === 0 ? (
        <p className="muted" data-testid="empty-result">Aradığınız ölçütlere uygun ürün bulunamadı. Filtreleri değiştirmeyi deneyin.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }} data-testid="product-grid">
          {r.items.map((p) => <ProductCard key={p.id} p={p} back={back} />)}
        </div>
      )}
      {r.pages > 1 && (
        <nav aria-label="Sayfalar" className="actions" style={{ flexWrap: "wrap", justifyContent: "center" }} data-testid="pagination">
          {r.page > 1 && <Link className="oy-btn oy-btn--outline oy-btn--sm" href={href(r.page - 1)} rel="prev">← Önceki</Link>}
          {Array.from({ length: r.pages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === r.pages || Math.abs(n - r.page) <= 2)
            .map((n) => (
              <Link key={n} href={href(n)} className={`oy-btn oy-btn--sm ${n === r.page ? "oy-btn--secondary" : "oy-btn--ghost"}`} aria-current={n === r.page ? "page" : undefined}>
                {n}
              </Link>
            ))}
          {r.page < r.pages && <Link className="oy-btn oy-btn--outline oy-btn--sm" href={href(r.page + 1)} rel="next">Sonraki →</Link>}
        </nav>
      )}
    </>
  );
}
