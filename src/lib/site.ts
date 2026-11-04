/** Sitenin herkese açık adresi (canlıda SITE_URL=https://alanadi.com.tr). */
export function siteUrl() {
  return (process.env.SITE_URL || process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Misafir sipariş takibinde doğrulanmış siparişin kimliğini taşıyan çerez (e-posta URL'ye yazılmaz). */
export const TRACK_COOKIE = "oy_takip";

/** Tüm sayfalarda ortak Open Graph alanları (sayfa düzeyindeki openGraph kök ayarı ezdiği için birlikte verilir). */
export const OG_BASE = { siteName: "Öner Yapı Market", locale: "tr_TR", type: "website" as const };

/** Açıklaması girilmemiş ürün / kategori için arama motorlarına gidecek kısa açıklama (yalnız mevcut bilgilerden). */
export function fallbackDescription(name: string, extra: (string | null | undefined)[]) {
  return [name, ...extra.filter(Boolean)].join(" · ").concat(". Türkiye'nin 81 iline kargo, güvenli ödeme.").slice(0, 160);
}
