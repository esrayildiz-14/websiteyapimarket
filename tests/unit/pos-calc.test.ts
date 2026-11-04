import { test } from "node:test";
import assert from "node:assert/strict";
import { posTotals, refundAmount, settle, vatOfGross } from "../../src/lib/pos-calc";

test("KDV dahil fiyattan KDV ayrıştırılır", () => {
  assert.equal(vatOfGross(120, 20), 20);
  assert.equal(vatOfGross(110, 10), 10);
  assert.equal(vatOfGross(99.99, 20), 16.67);
});

test("satır ve sepet indirimi; sepet indirimi orantılı dağıtılır, toplamlar tutarlı", () => {
  const r = posTotals([
    { quantity: 2, unitPrice: 120, discount: 0, vatRate: 20 }, // 240
    { quantity: 1, unitPrice: 60, discount: 10, vatRate: 10 }, // 50
  ], 29);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.subtotal, 300);
  assert.equal(r.discountTotal, 39);
  assert.equal(r.grandTotal, 261);
  assert.deepEqual(r.lines.map((l) => l.discount), [24, 15]); // 29 → 24 + 5
  assert.equal(r.lines.reduce((s, l) => s + l.lineTotal, 0), 261);
  assert.equal(r.vatTotal, Math.round((vatOfGross(216, 20) + vatOfGross(45, 10)) * 100) / 100);
});

test("kuruş farkı en büyük satıra yazılır", () => {
  const r = posTotals([1, 1, 1].map(() => ({ quantity: 1, unitPrice: 10, discount: 0, vatRate: 20 })), 1);
  if ("error" in r) throw new Error(r.error);
  assert.equal(Math.round(r.lines.reduce((s, l) => s + l.discount, 0) * 100) / 100, 1);
  assert.equal(r.grandTotal, 29);
});

test("hatalı girdiler reddedilir", () => {
  assert.ok("error" in posTotals([{ quantity: 0, unitPrice: 10, discount: 0, vatRate: 20 }]));
  assert.ok("error" in posTotals([{ quantity: 1, unitPrice: 10, discount: 11, vatRate: 20 }]));
  assert.ok("error" in posTotals([{ quantity: 1, unitPrice: 10, discount: 0, vatRate: 20 }], 11));
  assert.ok("error" in posTotals([{ quantity: 1, unitPrice: 10, discount: -1, vatRate: 20 }]));
});

test("ödeme: kart + nakit, para üstü; eksik ödeme ve fazla kart reddedilir", () => {
  assert.deepEqual(settle(261, 0, 300), { card: 0, cash: 261, change: 39 });
  assert.deepEqual(settle(261, 200, 61), { card: 200, cash: 61, change: 0 });
  assert.deepEqual(settle(261, 261, 0), { card: 261, cash: 0, change: 0 });
  assert.ok("error" in settle(261, 0, 260));
  assert.ok("error" in settle(261, 262, 0));
});

test("iade tutarı: adet payı; son iade kalan kuruşu kapatır; satılandan fazla iade yok", () => {
  assert.equal(refundAmount(100, 3, 0, 0, 1), 33.33);
  assert.equal(refundAmount(100, 3, 1, 33.33, 1), 33.33);
  assert.equal(refundAmount(100, 3, 2, 66.66, 1), 33.34);
  assert.equal(refundAmount(100, 3, 0, 0, 3), 100);
  assert.equal(refundAmount(100, 3, 2, 66.66, 2), null);
  assert.equal(refundAmount(100, 3, 0, 0, 0), null);
});
