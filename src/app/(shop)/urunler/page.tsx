import { listOptionsFrom, listProducts } from "@/server/catalog";
import ProductListing from "@/components/shop/ProductListing";

export const metadata = { title: "Tüm ürünler", alternates: { canonical: "/urunler" } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AllProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const r = await listProducts(null, listOptionsFrom(sp));
  return (
    <>
      <h1 className="h1">Tüm ürünler</h1>
      <ProductListing r={r} path="/urunler" sp={sp} />
    </>
  );
}
