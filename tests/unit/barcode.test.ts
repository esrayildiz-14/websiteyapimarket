import { test } from "node:test";
import assert from "node:assert/strict";
import { barcodeProblem, checkDigit, isInternalBarcode, isValidBarcode, makeInternalBarcode, normalizeBarcode } from "../../src/lib/barcode";

test("barkod: boşluk/tire temizlenir, 8-12-13-14 hane kabul edilir", () => {
  assert.equal(normalizeBarcode("869 0000-000012"), "8690000000012");
  assert.equal(isValidBarcode("8690000000012"), true); // EAN-13
  assert.equal(isValidBarcode("96385074"), true); // EAN-8
  assert.equal(isValidBarcode("036000291452"), true); // UPC-A
  assert.equal(isValidBarcode("10012345678902"), true); // GTIN-14
});

test("barkod: hatalı kontrol hanesinde doğru numara önerilir", () => {
  assert.match(barcodeProblem("8690000000019")!, /8690000000012/);
  assert.match(barcodeProblem("12345")!, /8, 12, 13 veya 14/);
  assert.match(barcodeProblem("86900A0000012")!, /rakam/);
  assert.equal(barcodeProblem("8690000000012"), null);
});

test("mağaza içi barkod 29 ile başlar ve geçerlidir", () => {
  const c = makeInternalBarcode("1234567890");
  assert.equal(c.length, 13);
  assert.ok(c.startsWith("29"));
  assert.equal(isValidBarcode(c), true);
  assert.equal(isInternalBarcode(c), true);
  assert.equal(checkDigit(c.slice(0, 12)), Number(c[12]));
});
