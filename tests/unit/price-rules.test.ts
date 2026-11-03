import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkNewPrice, type BulkPriceInput } from "../../src/lib/price-rules";

const base: BulkPriceInput = { scope: "all", field: "price", op: "increase_pct", amount: 10, rounding: "none" };

test("toplu fiyat: % artış ve yuvarlama", () => {
  assert.deepEqual(bulkNewPrice({ price: 1000, salePrice: null }, base), { price: 1100, salePrice: null });
  assert.deepEqual(bulkNewPrice({ price: 1249.37, salePrice: null }, { ...base, amount: 0, rounding: "x90" }), { price: 1249.9, salePrice: null });
  assert.deepEqual(bulkNewPrice({ price: 99.5, salePrice: null }, { ...base, amount: 0, rounding: "integer" }), { price: 100, salePrice: null });
});

test("toplu fiyat: indirimli fiyat satış fiyatının üstünde kalırsa indirim kaldırılır", () => {
  assert.deepEqual(bulkNewPrice({ price: 1000, salePrice: 950 }, { ...base, op: "decrease_pct", amount: 10 }), { price: 900, salePrice: null });
  assert.deepEqual(bulkNewPrice({ price: 1000, salePrice: 800 }, { ...base, op: "decrease_pct", amount: 10 }), { price: 900, salePrice: 800 });
});

test("toplu fiyat: indirimli fiyat alanı ve sınırlar", () => {
  assert.deepEqual(bulkNewPrice({ price: 1000, salePrice: null }, { ...base, field: "salePrice", op: "decrease_pct", amount: 20 }), { price: 1000, salePrice: 800 });
  assert.equal(bulkNewPrice({ price: 1000, salePrice: null }, { ...base, field: "salePrice", op: "increase_pct", amount: 5 }), null);
  assert.equal(bulkNewPrice({ price: 50, salePrice: null }, { ...base, op: "decrease_fixed", amount: 60 }), null);
  assert.deepEqual(bulkNewPrice({ price: 100, salePrice: 90 }, { ...base, op: "clear_sale" }), { price: 100, salePrice: null });
  assert.equal(bulkNewPrice({ price: 100, salePrice: null }, { ...base, op: "clear_sale" }), null);
});
