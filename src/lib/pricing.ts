import { round2 } from "./money";

export type DiscountRule = {
  type: "PERCENT" | "FIXED";
  value: number;
  target: "ALL" | "PRODUCT" | "CATEGORY" | "BRAND";
  targetId: string | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
};

export type PricedProduct = {
  id: string;
  price: number;
  salePrice: number | null;
  categoryId: string;
  categoryParentId?: string | null;
  brandId: string | null;
};

/**
 * Ürünün müşteriye gösterilecek fiyatı: indirimli fiyat ve aktif kampanyalardan en düşüğü.
 * Fiyat hiçbir zaman 0'ın altına inmez.
 */
export function effectivePrice(p: PricedProduct, rules: DiscountRule[], now = new Date()) {
  let best = p.salePrice !== null && p.salePrice < p.price ? p.salePrice : p.price;
  let source: "price" | "salePrice" | "campaign" = best === p.price ? "price" : "salePrice";
  for (const r of rules) {
    if (!r.isActive || now < r.startsAt || now > r.endsAt) continue;
    const applies =
      r.target === "ALL" ||
      (r.target === "PRODUCT" && r.targetId === p.id) ||
      (r.target === "CATEGORY" && (r.targetId === p.categoryId || r.targetId === p.categoryParentId)) ||
      (r.target === "BRAND" && r.targetId === p.brandId);
    if (!applies) continue;
    const candidate = r.type === "PERCENT" ? p.price * (1 - r.value / 100) : p.price - r.value;
    const c = Math.max(0, round2(candidate));
    if (c < best) {
      best = c;
      source = "campaign";
    }
  }
  return { price: best, listPrice: p.price, discounted: best < p.price, source };
}
