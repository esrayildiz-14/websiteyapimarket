import Link from "next/link";
import ShopHeader from "@/components/shop/ShopHeader";

export const dynamic = "force-dynamic";

const LINKS: [string, [string, string][]][] = [
  ["Kurumsal", [["/sayfa/hakkimizda", "Hakkımızda"], ["/sayfa/iletisim", "İletişim"], ["/sss", "Sıkça sorulan sorular"]]],
  ["Alışveriş", [["/sayfa/teslimat-ve-kargo", "Teslimat ve kargo"], ["/sayfa/iade-ve-degisim", "İade ve değişim"], ["/siparis-takip", "Sipariş takip"]]],
  ["Yasal", [["/sayfa/kvkk", "KVKK aydınlatma metni"], ["/sayfa/mesafeli-satis-sozlesmesi", "Mesafeli satış sözleşmesi"], ["/sayfa/on-bilgilendirme-formu", "Ön bilgilendirme formu"], ["/sayfa/cerez-politikasi", "Çerez politikası"]]],
];

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ShopHeader />
      <main className="container" style={{ padding: "24px clamp(16px,3vw,32px) 64px", display: "flex", flexDirection: "column", gap: 24 }}>
        {children}
      </main>
      <footer style={{ background: "var(--navy-900)", color: "var(--ink-inverse-muted)", padding: "40px 0 24px", fontSize: 14 }}>
        <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24, padding: "0 clamp(16px,3vw,32px)" }}>
          <div>
            <div style={{ font: "700 28px/0.9 var(--font-display)", color: "var(--ink-inverse)" }}>
              ÖNER<span style={{ color: "var(--orange-500)" }}>.</span>
            </div>
            <p>Türkiye&apos;nin 81 iline kargo. Yurt dışı gönderim ve mağazadan teslim yoktur.</p>
          </div>
          {LINKS.map(([title, items]) => (
            <nav key={title} aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ color: "var(--ink-inverse)" }}>{title}</b>
              {items.map(([href, label]) => (
                <Link key={href} href={href} style={{ color: "var(--ink-inverse-muted)" }}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="container" style={{ padding: "24px clamp(16px,3vw,32px) 0", fontSize: 12 }}>
          © {new Date().getFullYear()} Öner Yapı Market · Ödemeler iyzico güvencesiyle alınır; kart bilgileri bu sitede saklanmaz.
        </div>
      </footer>
    </>
  );
}
