import { round2 } from "./money";

export type CouponRule = {
  type: "PERCENT" | "FIXED"; value: number; minOrderTotal: number | null; maxDiscount: number | null;
  usageLimit: number | null; perUserLimit: number | null; usedCount: number; startsAt: Date | null; endsAt: Date | null; isActive: boolean;
};

/** Kupon indirimi (saf fonksiyon). İndirim ürün toplamını aşamaz; kargoya uygulanmaz. */
export function couponDiscount(c: CouponRule, subtotal: number, userUses: number, now = new Date()): { ok: true; discount: number } | { ok: false; message: string } {
  if (!c.isActive) return { ok: false, message: "Kupon kullanımda değil." };
  if (c.startsAt && now < c.startsAt) return { ok: false, message: "Kupon henüz başlamadı." };
  if (c.endsAt && now > c.endsAt) return { ok: false, message: "Kuponun süresi doldu." };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return { ok: false, message: "Kupon kullanım limiti doldu." };
  if (c.perUserLimit !== null && userUses >= c.perUserLimit) return { ok: false, message: "Bu kuponu kullanım hakkınız doldu." };
  if (c.minOrderTotal !== null && subtotal < c.minOrderTotal)
    return { ok: false, message: `Kupon en az ${c.minOrderTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺ alışverişte geçerli.` };
  let d = c.type === "PERCENT" ? (subtotal * c.value) / 100 : c.value;
  if (c.maxDiscount !== null) d = Math.min(d, c.maxDiscount);
  d = round2(Math.min(d, subtotal));
  return d > 0 ? { ok: true, discount: d } : { ok: false, message: "Kupon bu sepete indirim sağlamıyor." };
}
