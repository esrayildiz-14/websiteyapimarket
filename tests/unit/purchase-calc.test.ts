import { test } from "node:test";
import assert from "node:assert/strict";
import { canDo, purchaseLine, purchaseTotals, taxNumberProblem, unitCost, weightedAverageCost } from "../../src/lib/purchase-calc";

test("satır: iskonto KDV'den önce uygulanır, kuruşa yuvarlanır", () => {
  assert.deepEqual(purchaseLine({ quantity: 3, unitPrice: 99.99, discountPct: 10, vatRate: 20 }), {
    gross: 299.97, discount: 30, net: 269.97, vat: 53.99, total: 323.96,
  });
  assert.deepEqual(purchaseLine({ quantity: 10, unitPrice: 12.5, discountPct: 0, vatRate: 10 }), { gross: 125, discount: 0, net: 125, vat: 12.5, total: 137.5 });
});

test("sipariş toplamı satır toplamlarıyla tutarlı; farklı KDV oranları", () => {
  const t = purchaseTotals([
    { quantity: 3, unitPrice: 99.99, discountPct: 10, vatRate: 20 },
    { quantity: 10, unitPrice: 12.5, discountPct: 0, vatRate: 10 },
  ]);
  assert.deepEqual(t, { subtotal: 394.97, discountTotal: 30, vatTotal: 66.49, grandTotal: 461.46 });
  assert.equal(Math.round((t.subtotal + t.vatTotal) * 100) / 100, t.grandTotal);
  assert.deepEqual(purchaseTotals([]), { subtotal: 0, discountTotal: 0, vatTotal: 0, grandTotal: 0 });
});

test("birim maliyet ve ağırlıklı ortalama maliyet", () => {
  assert.equal(unitCost(100, 15), 85);
  assert.equal(weightedAverageCost(10, 80, 10, 100), 90);
  assert.equal(weightedAverageCost(0, 80, 5, 100), 100); // elde stok yoksa yeni maliyet
  assert.equal(weightedAverageCost(4, null, 2, 50), 50); // önceki maliyet bilinmiyor
  assert.equal(weightedAverageCost(-3, 80, 1, 60), 60); // negatif stok 0 sayılır
  assert.equal(weightedAverageCost(3, 10, 0, 99), 10);
  assert.equal(weightedAverageCost(3, 10, 1, 11), 10.25);
});

test("durum geçişleri: stok yalnız iletilmiş siparişte kabul edilir; teslim alınmış sipariş iptal edilemez", () => {
  assert.equal(canDo("receive", "DRAFT"), false);
  assert.equal(canDo("receive", "PENDING_APPROVAL"), false);
  assert.equal(canDo("receive", "SENT"), true);
  assert.equal(canDo("receive", "PARTIAL"), true);
  assert.equal(canDo("receive", "RECEIVED"), false);
  assert.equal(canDo("cancel", "PARTIAL"), false);
  assert.equal(canDo("cancel", "RECEIVED"), false);
  assert.equal(canDo("edit", "SENT"), false);
});

test("vergi numarası biçimi", () => {
  assert.equal(taxNumberProblem(""), null);
  assert.equal(taxNumberProblem("1234567890"), null);
  assert.equal(taxNumberProblem("12345678901"), null);
  assert.match(taxNumberProblem("12345")!, /10 haneli/);
  assert.match(taxNumberProblem("12345abcde")!, /10 haneli/);
});
