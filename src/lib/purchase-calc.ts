// Satın alma tutar hesapları (saf fonksiyonlar). Tutarlar kuruş hassasiyetinde yuvarlanır.
import { round2 } from "./money";

export type PurchaseLineInput = { quantity: number; unitPrice: number; discountPct: number; vatRate: number };

/** Satır: brüt = adet × birim fiyat; iskonto; net (KDV hariç); KDV. */
export function purchaseLine(l: PurchaseLineInput) {
  const gross = round2(l.quantity * l.unitPrice);
  const discount = round2((gross * l.discountPct) / 100);
  const net = round2(gross - discount);
  const vat = round2((net * l.vatRate) / 100);
  return { gross, discount, net, vat, total: round2(net + vat) };
}

export function purchaseTotals(lines: PurchaseLineInput[]) {
  const r = lines.map(purchaseLine);
  const sum = (k: keyof ReturnType<typeof purchaseLine>) => round2(r.reduce((s, x) => s + x[k], 0));
  return { subtotal: sum("net"), discountTotal: sum("discount"), vatTotal: sum("vat"), grandTotal: sum("total") };
}

/** İskonto sonrası birim maliyet (KDV hariç), 4 hane. */
export function unitCost(unitPrice: number, discountPct: number) {
  return Math.round(unitPrice * (1 - discountPct / 100) * 10_000) / 10_000;
}

/**
 * Ağırlıklı ortalama maliyet. Eldeki adet 0 veya mevcut maliyet bilinmiyorsa yeni maliyet esas alınır.
 * Negatif adet (veri hatası) 0 sayılır.
 */
export function weightedAverageCost(onHand: number, currentAvg: number | null, receivedQty: number, receivedUnitCost: number) {
  const have = Math.max(0, onHand);
  if (receivedQty <= 0) return currentAvg;
  if (currentAvg === null || have === 0) return Math.round(receivedUnitCost * 10_000) / 10_000;
  return Math.round(((have * currentAvg + receivedQty * receivedUnitCost) / (have + receivedQty)) * 10_000) / 10_000;
}

/** Durum geçişleri: hangi durumdan hangi işlem yapılabilir. */
export const PURCHASE_TRANSITIONS = {
  submit: ["DRAFT"],
  backToDraft: ["PENDING_APPROVAL"],
  approve: ["PENDING_APPROVAL"],
  receive: ["SENT", "PARTIAL"],
  cancel: ["DRAFT", "PENDING_APPROVAL", "SENT"],
  edit: ["DRAFT"],
} as const;

export function canDo(action: keyof typeof PURCHASE_TRANSITIONS, status: string) {
  return (PURCHASE_TRANSITIONS[action] as readonly string[]).includes(status);
}

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Taslak", PENDING_APPROVAL: "Onay bekliyor", SENT: "Tedarikçiye iletildi", PARTIAL: "Kısmi teslim edildi",
  RECEIVED: "Tam teslim edildi", CANCELLED: "İptal edildi",
};

/** Vergi no: 10 haneli VKN veya 11 haneli T.C. kimlik no (şahıs şirketi). */
export function taxNumberProblem(v: string): string | null {
  const s = v.replace(/\s/g, "");
  if (!s) return null;
  if (!/^\d{10,11}$/.test(s)) return "Vergi numarası 10 haneli (VKN) veya 11 haneli (T.C. kimlik no) olmalı.";
  return null;
}
