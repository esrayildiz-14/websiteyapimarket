import { z } from "zod";
import { round2 } from "./money";

export const bulkPriceSchema = z.object({
  scope: z.enum(["category", "brand", "all"]),
  scopeId: z.string().optional(),
  field: z.enum(["price", "salePrice"]),
  op: z.enum(["increase_pct", "decrease_pct", "increase_fixed", "decrease_fixed", "clear_sale"]),
  amount: z.number().min(0).max(1_000_000),
  rounding: z.enum(["none", "integer", "x90"]),
});
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;

function roundWith(v: number, mode: BulkPriceInput["rounding"]) {
  if (mode === "integer") return Math.round(v);
  if (mode === "x90") return Math.max(0.9, Math.floor(v) + 0.9); // 1.249,37 → 1.249,90
  return round2(v);
}

/** Toplu fiyat hesabı (saf fonksiyon; birim testleri bunu dener). null = bu ürün atlanır. */
export function bulkNewPrice(cur: { price: number; salePrice: number | null }, i: BulkPriceInput): { price: number; salePrice: number | null } | null {
  if (i.op === "clear_sale") return cur.salePrice === null ? null : { price: cur.price, salePrice: null };
  const base = i.field === "price" ? cur.price : cur.salePrice ?? cur.price;
  let v =
    i.op === "increase_pct" ? base * (1 + i.amount / 100)
    : i.op === "decrease_pct" ? base * (1 - i.amount / 100)
    : i.op === "increase_fixed" ? base + i.amount
    : base - i.amount;
  v = roundWith(v, i.rounding);
  if (!(v > 0)) return null;
  if (i.field === "price") {
    // satış fiyatı indirimli fiyatın altına inerse indirim kaldırılır
    return { price: v, salePrice: cur.salePrice !== null && cur.salePrice < v ? cur.salePrice : null };
  }
  return v < cur.price ? { price: cur.price, salePrice: v } : null;
}

