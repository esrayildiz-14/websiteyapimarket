import { listOptionsFrom, listProducts } from "@/server/catalog";
import ProductListing from "@/components/shop/ProductListing";

export const metadata = { title: "Arama sonuçları", robots: { index: false, follow: true } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const r = q.length >= 2 ? await listProducts(null, { ...listOptionsFrom(sp), q }) : null;
  return (
    <>
      <h1 className="h1">{q ? `“${q}” için sonuçlar` : "Arama"}</h1>
      {r ? (
        <ProductListing r={r} path="/arama" sp={sp} hidden={{ q }} />
      ) : (
        <p className="muted" data-testid="result-count">En az 2 karakter girin.</p>
      )}
    </>
  );
}
