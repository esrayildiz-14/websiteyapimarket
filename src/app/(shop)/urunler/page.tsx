import { listCategoryProducts } from "@/server/catalog";
import ProductCard from "@/components/shop/ProductCard";

export const metadata = { title: "Tüm ürünler" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AllProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sort = typeof sp.sirala === "string" ? sp.sirala : "";
  const products = await listCategoryProducts(null, { sort, take: 96 });
  return (
    <>
      <h1 className="h1">Tüm ürünler</h1>
      <p className="muted" data-testid="result-count">
        {products.length} ürün
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }} data-testid="product-grid">
        {products.map((p) => (
          <ProductCard key={p.id} p={p} back="/urunler" />
        ))}
      </div>
    </>
  );
}
