// Rapor hesapları (saf). Tutarlar: brüt = KDV dahil, net = KDV hariç.
import { round2 } from "./money";

/** Türkiye saati (UTC+3, yaz saati uygulaması yok). Sunucu UTC'de çalışsa da gün/ay sınırı İstanbul'a göre alınır. */
export function istanbulYmd(d: Date) {
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
export function istanbulDayStart(d: Date) {
  return new Date(`${istanbulYmd(d)}T00:00:00+03:00`);
}
export function istanbulMonthStart(d: Date) {
  return new Date(`${istanbulYmd(d).slice(0, 7)}-01T00:00:00+03:00`);
}

export type Fact = {
  date: Date;
  channel: "ONLINE" | "MAGAZA";
  productId: string | null;
  productName: string;
  sku: string;
  category: string;
  brand: string;
  customer: string;
  qty: number; // iade/iptalde negatif
  gross: number; // KDV dahil, indirim sonrası (iade/iptalde negatif)
  vat: number;
  unitCost: number | null; // KDV hariç birim maliyet
  costSource: "ortalama" | "elle" | "yok";
};

export type Group = "gun" | "hafta" | "ay" | "yil";
export type Dim = "urun" | "kategori" | "marka" | "kanal" | "musteri";

/** Türkiye saatine göre dönem anahtarı (ISO hafta). */
export function periodKey(d: Date, g: Group) {
  const t = new Date(d.getTime() + 3 * 3600_000); // UTC+3
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, day = t.getUTCDate();
  if (g === "yil") return String(y);
  if (g === "ay") return `${y}-${String(m).padStart(2, "0")}`;
  if (g === "gun") return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(Date.UTC(y, m - 1, day));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const ys = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((date.getTime() - ys.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-H${String(w).padStart(2, "0")}`;
}

export type Row = { key: string; label: string; qty: number; gross: number; net: number; vat: number; cogs: number; uncostedQty: number; gross_profit: number; margin: number | null };

export function aggregate(facts: Fact[], keyOf: (f: Fact) => { key: string; label: string }): Row[] {
  const m = new Map<string, Row>();
  for (const f of facts) {
    const { key, label } = keyOf(f);
    const r = m.get(key) ?? { key, label, qty: 0, gross: 0, net: 0, vat: 0, cogs: 0, uncostedQty: 0, gross_profit: 0, margin: null };
    r.qty += f.qty;
    r.gross += f.gross;
    r.vat += f.vat;
    r.net += f.gross - f.vat;
    if (f.unitCost === null) r.uncostedQty += f.qty;
    else r.cogs += f.qty * f.unitCost;
    m.set(key, r);
  }
  return [...m.values()].map((r) => {
    const net = round2(r.net), cogs = round2(r.cogs);
    // Maliyeti bilinmeyen adet varsa brüt kâr "eksik" hesaplanır; marj yalnız tamamen maliyetli satırlarda verilir.
    const gp = round2(net - cogs);
    return { ...r, gross: round2(r.gross), vat: round2(r.vat), net, cogs, gross_profit: gp, margin: r.uncostedQty === 0 && net !== 0 ? round2((gp / net) * 100) : null };
  });
}

export function byDim(d: Dim) {
  return (f: Fact) => {
    if (d === "urun") return { key: f.productId ?? f.sku, label: `${f.productName} (${f.sku})` };
    if (d === "kategori") return { key: f.category, label: f.category };
    if (d === "marka") return { key: f.brand, label: f.brand };
    if (d === "kanal") return { key: f.channel, label: f.channel === "ONLINE" ? "Online" : "Mağaza" };
    return { key: f.customer, label: f.customer };
  };
}

export function toCsv(header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Türkçe Excel uyumu: ; ayırıcı, UTF-8 BOM
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}
