// Para ve sayı yardımcıları. Saf fonksiyonlar: hem sunucu hem istemci hem testler kullanır.

/**
 * Kullanıcının yazdığı tutarı sayıya çevirir.
 * Kabul eder: "2650", "2650,5", "2.650,50", "2650.50", "₺ 2.650,50".
 * Geçersizse null döner.
 */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? round2(input) : null;
  if (typeof input !== "string") return null;
  let s = input.replace(/[₺\s]/g, "").replace(/TL$/i, "");
  if (s === "") return null;
  if (s.includes(",")) {
    // Türkçe biçim: nokta binlik, virgül ondalık
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // "1.234.567" gibi yalnız binlik ayraçlı
    s = s.replace(/\./g, "");
  } else if (/^\d{1,3}\.\d{3}$/.test(s)) {
    // "2.650" → 2650 (Türkçe binlik); "26.50" ondalık kalır
    s = s.replace(".", "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}

/** Ondalık sayıyı (ölçü, ağırlık) çevirir: "12,5" → 12.5 */
export function parseDecimal(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const s = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const tl = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 2650.5 → "2.650,50 ₺" */
export function formatTL(n: number | string | { toString(): string } | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = typeof n === "number" ? n : Number(n.toString());
  return `${tl.format(v)} ₺`;
}

/** Form alanında gösterim: 2650.5 → "2650,50" */
export function toInputMoney(n: number | string | { toString(): string } | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  const v = typeof n === "number" ? n : Number(n.toString());
  return v.toFixed(2).replace(".", ",");
}

/** KDV dahil tutarın içindeki KDV: 120 ₺, %20 → 20 ₺ */
export function vatIncluded(grossAmount: number, vatRate: number): number {
  if (vatRate <= 0) return 0;
  return round2(grossAmount - grossAmount / (1 + vatRate / 100));
}

/** İndirim oranı (tam sayı yüzde): 2650 → 2173 = 18 */
export function discountPercent(price: number, salePrice: number | null | undefined): number | null {
  if (salePrice === null || salePrice === undefined || salePrice >= price || price <= 0) return null;
  return Math.round(((price - salePrice) / price) * 100);
}
