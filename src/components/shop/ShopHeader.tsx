import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { currentCart } from "@/server/cart";

export default async function ShopHeader() {
  const [mains, customer, cart] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null, isActive: true }, orderBy: { sortOrder: "asc" }, take: 9 }),
    getCurrentCustomer(),
    currentCart(false),
  ]);
  const count = cart ? (await prisma.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } }))._sum.quantity ?? 0 : 0;
  return (
    <header style={{ borderBottom: "1px solid var(--line)" }}>
      <div style={{ background: "var(--navy-900)", color: "var(--ink-inverse-muted)", fontSize: 13 }}>
        <div className="container" style={{ padding: "8px clamp(16px,3vw,32px)" }}>
          Türkiye&apos;nin 81 iline kargo · Ağır ve hacimli ürünler dahil
        </div>
      </div>
      <div className="container" style={{ display: "flex", alignItems: "center", gap: 24, padding: "16px clamp(16px,3vw,32px)", flexWrap: "wrap" }}>
        <Link href="/" style={{ textDecoration: "none", color: "var(--navy-900)", display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ font: "700 34px/0.9 var(--font-display)" }}>
            ÖNER<span style={{ color: "var(--orange-700)" }}>.</span>
          </span>
          <span style={{ font: "600 12px/14px var(--font-sans)", letterSpacing: "0.18em", color: "var(--ink-muted)" }}>YAPI MARKET</span>
        </Link>
        <form action="/arama" role="search" style={{ flex: "1 1 280px", display: "flex", gap: 8, maxWidth: 560 }}>
          <input className="oy-input" name="q" placeholder="Ürün, marka veya ürün kodu ara" aria-label="Ara" />
          <button className="oy-btn oy-btn--secondary" type="submit">
            Ara
          </button>
        </form>
        <nav aria-label="Hesap" className="actions" style={{ marginLeft: "auto" }}>
          <Link href={customer ? "/hesabim" : "/giris"} data-testid="account-link">
            {customer ? `Hesabım (${customer.firstName})` : "Giriş yap / Üye ol"}
          </Link>
          <Link href="/siparis-takip">Sipariş takip</Link>
          <Link href="/sepet" className="oy-btn oy-btn--primary oy-btn--sm" data-testid="cart-link">
            Sepet ({count})
          </Link>
        </nav>
      </div>
      <nav aria-label="Kategoriler" style={{ background: "var(--navy-800)" }}>
        <div className="container" style={{ display: "flex", gap: 4, overflowX: "auto", whiteSpace: "nowrap" }}>
          <Link href="/urunler" style={{ padding: "12px 12px", color: "var(--ink-inverse)", textDecoration: "none", fontSize: 15, fontWeight: 700 }}>
            Tüm ürünler
          </Link>
          {mains.map((m) => (
            <Link key={m.id} href={`/kategori/${m.slug}`} style={{ padding: "12px 12px", color: "var(--ink-inverse-muted)", textDecoration: "none", fontSize: 15, fontWeight: 500 }}>
              {m.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
