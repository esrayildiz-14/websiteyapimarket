import { test } from "node:test";
import assert from "node:assert/strict";
import { discountPercent, formatTL, parseMoney, vatIncluded } from "../../src/lib/money";

test("parseMoney: Türkçe ve düz biçimler", () => {
  assert.equal(parseMoney("2650"), 2650);
  assert.equal(parseMoney("2.650,50"), 2650.5);
  assert.equal(parseMoney("2650,5"), 2650.5);
  assert.equal(parseMoney("2650.50"), 2650.5);
  assert.equal(parseMoney("2.650"), 2650);
  assert.equal(parseMoney("1.234.567"), 1234567);
  assert.equal(parseMoney("₺ 1.250,00"), 1250);
  assert.equal(parseMoney("0,1"), 0.1);
});

test("parseMoney: geçersiz girişler null döner", () => {
  for (const bad of ["", "abc", "12,5,3", "--5", "1e5"]) assert.equal(parseMoney(bad), null, bad);
});

test("formatTL", () => {
  assert.equal(formatTL(2650.5).replace(/ /g, " "), "2.650,50 ₺");
});

test("KDV dahil tutardan KDV", () => {
  assert.equal(vatIncluded(120, 20), 20);
  assert.equal(vatIncluded(110, 10), 10);
  assert.equal(vatIncluded(100, 0), 0);
});

test("indirim oranı", () => {
  assert.equal(discountPercent(2650, 2173), 18);
  assert.equal(discountPercent(100, 100), null);
  assert.equal(discountPercent(100, null), null);
});
