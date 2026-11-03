import { listCategoryProducts } from "@/server/catalog";
import ProductCard from "@/components/shop/ProductCard";

export const metadata = { title: "Arama sonuçları", robots: { index: false, follow: true } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const products = q.length >= 2 ? await listCategoryProducts(null, { q, sort: typeof sp.sirala === "string" ? sp.sirala : "", take: 96 }) : [];
  return (
    <>
      <h1 className="h1">{q ? `“${q}” için sonuçlar` : "Arama"}</h1>
      <p className="muted" data-testid="result-count">
        {q.length < 2 ? "En az 2 karakter girin." : `${products.length} ürün`}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }} data-testid="product-grid">
        {products.map((p) => (
          <ProductCard key={p.id} p={p} back={`/arama?q=${encodeURIComponent(q)}`} />
        ))}
      </div>
    </>
  );
}
