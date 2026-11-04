// Mağaza kasası tutar hesapları (saf). Fiyatlar KDV DAHİL'dir; KDV, dahil fiyattan ayrıştırılır.
import { round2 } from "./money";

export type PosLineInput = { quantity: number; unitPrice: number; discount: number; vatRate: number };

/** Dahil fiyattan KDV payı: tutar × oran / (100 + oran) */
export const vatOfGross = (gross: number, rate: number) => round2((gross * rate) / (100 + rate));

/**
 * Satırlar + sepet indirimi. Sepet indirimi satırlara tutarlarıyla orantılı dağıtılır (KDV doğru hesaplansın);
 * kuruş farkı en büyük satıra yazılır. Hatalı girdi (negatif, satırı aşan indirim) hata döner.
 */
export function posTotals(lines: PosLineInput[], cartDiscount = 0) {
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) return { error: "Adetler pozitif tam sayı olmalı." } as const;
  if (lines.some((l) => l.discount < 0 || l.unitPrice < 0) || cartDiscount < 0) return { error: "İndirim negatif olamaz." } as const;
  const base = lines.map((l) => round2(l.quantity * l.unitPrice));
  if (lines.some((l, i) => l.discount > base[i])) return { error: "Satır indirimi satır tutarını aşamaz." } as const;
  const afterLine = lines.map((l, i) => round2(base[i] - l.discount));
  const sumAfter = round2(afterLine.reduce((a, b) => a + b, 0));
  if (cartDiscount > sumAfter) return { error: "Sepet indirimi toplamı aşamaz." } as const;
  const share = afterLine.map((v) => (sumAfter > 0 ? round2((cartDiscount * v) / sumAfter) : 0));
  const diff = round2(cartDiscount - share.reduce((a, b) => a + b, 0));
  if (diff !== 0 && share.length) {
    const big = afterLine.indexOf(Math.max(...afterLine));
    share[big] = round2(share[big] + diff);
  }
  const out = lines.map((l, i) => {
    const discount = round2(l.discount + share[i]);
    const lineTotal = round2(base[i] - discount);
    return { discount, lineTotal, vat: vatOfGross(lineTotal, l.vatRate) };
  });
  const subtotal = round2(base.reduce((a, b) => a + b, 0));
  const discountTotal = round2(out.reduce((a, b) => a + b.discount, 0));
  const grandTotal = round2(subtotal - discountTotal);
  return { lines: out, subtotal, discountTotal, grandTotal, vatTotal: round2(out.reduce((a, b) => a + b.vat, 0)) } as const;
}

/**
 * Ödeme: kart tutarı + nakit. Nakit, kalan tutardan fazla verilebilir (para üstü). Kart, toplamı aşamaz.
 * Dönen cash = kayda geçen nakit tahsilat (para üstü düşülmüş).
 */
export function settle(grandTotal: number, card: number, cashGiven: number) {
  if (card < 0 || cashGiven < 0) return { error: "Ödeme tutarı negatif olamaz." } as const;
  if (round2(card) > grandTotal) return { error: "Kart tutarı toplamı aşamaz." } as const;
  const due = round2(grandTotal - card);
  if (round2(cashGiven) < due) return { error: `Eksik ödeme: ${due.toFixed(2)} ₺ nakit gerekiyor.` } as const;
  return { card: round2(card), cash: due, change: round2(cashGiven - due) } as const;
}

/**
 * İade tutarı: satırın indirimli toplamının adet başına payı. Satırın son iadesi, o güne kadar iade edilen tutarı
 * toplamdan düşerek kuruş farkını kapatır. Satılandan fazla iade edilemez (null).
 */
export function refundAmount(lineTotal: number, quantity: number, returnedQty: number, refundedSoFar: number, returnQty: number) {
  if (!Number.isInteger(returnQty) || returnQty <= 0 || returnedQty + returnQty > quantity) return null;
  if (returnedQty + returnQty === quantity) return round2(lineTotal - refundedSoFar);
  return round2((lineTotal / quantity) * returnQty);
}
