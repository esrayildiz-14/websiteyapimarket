import Link from "next/link";

export const metadata = { title: "Sayfa bulunamadı", robots: { index: false } };

/** 404: bulunamayan adresler için kullanıcıyı yönlendiren sayfa. */
export default function NotFound() {
  return (
    <main className="container" style={{ padding: "64px clamp(16px,3vw,32px)", display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
      <p className="muted" style={{ margin: 0 }}>Hata 404</p>
      <h1 className="h1" data-testid="not-found">Aradığınız sayfa bulunamadı</h1>
      <p style={{ margin: 0, maxWidth: 560 }}>Bağlantı hatalı olabilir veya ürün yayından kaldırılmış olabilir. Aramayı deneyin ya da ana sayfaya dönün.</p>
      <form action="/arama" role="search" style={{ display: "flex", gap: 8, width: "100%", maxWidth: 480 }}>
        <input className="oy-input" name="q" placeholder="Ürün, marka veya ürün kodu" aria-label="Ara" />
        <button className="oy-btn oy-btn--secondary" type="submit">Ara</button>
      </form>
      <div className="actions">
        <Link className="oy-btn oy-btn--primary" href="/">Ana sayfa</Link>
        <Link className="oy-btn oy-btn--outline" href="/urunler">Tüm ürünler</Link>
      </div>
    </main>
  );
}
