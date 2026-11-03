import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidBarcode } from "../../src/lib/barcode";
import { slugify } from "../../src/lib/slug";
import { detectImage, validateImage } from "../../src/lib/image";
import { effectivePrice } from "../../src/lib/pricing";
import { fieldErrors, productFormToObject, productInputSchema } from "../../src/lib/validation/product";

test("slugify Türkçe karakterler", () => {
  assert.equal(slugify("Akülü Vidalama 18V, 2 Akülü Set"), "akulu-vidalama-18v-2-akulu-set");
  assert.equal(slugify("İç Cephe Boyaları"), "ic-cephe-boyalari");
  assert.equal(slugify("ÇİMENTO ŞÖ ĞÜ"), "cimento-so-gu");
});

test("barkod kontrol hanesi", () => {
  assert.equal(isValidBarcode("8690000000014"), false);
  assert.equal(isValidBarcode("4006381333931"), true); // EAN-13
  assert.equal(isValidBarcode("96385074"), true); // EAN-8
  assert.equal(isValidBarcode("12345"), false);
});

test("görsel türü içerikten belirlenir", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const fakeExe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
  assert.equal(detectImage(png)?.ext, "png");
  assert.equal(detectImage(jpg)?.ext, "jpg");
  assert.equal(detectImage(fakeExe), null);
  assert.equal(validateImage(fakeExe, "virus.jpg").ok, false);
  assert.equal(validateImage(new Uint8Array(6 * 1024 * 1024).fill(0xff), "buyuk.jpg").ok, false);
});

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "İç Cephe Silinebilir Boya 15 L", sku: "fb-icb-15", barcode: "", mainCategoryId: "c1", subCategoryId: "c2", brandId: "",
    price: "2.650,00", salePrice: "2.173,00", vatRate: "20", stock: "10", minStock: "2", saleUnit: "KOVA",
    weightKg: "21", widthCm: "30", heightCm: "35", lengthCm: "30", shippingProfileId: "p1", status: "ACTIVE",
    specs: JSON.stringify([{ label: "Hacim", value: "15 L" }, { label: "", value: "" }]),
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
}

test("ürün formu: geçerli giriş", () => {
  const r = productInputSchema.safeParse(productFormToObject(form()));
  assert.ok(r.success, r.success ? "" : JSON.stringify(fieldErrors(r.error)));
  assert.equal(r.data.sku, "FB-ICB-15");
  assert.equal(r.data.price, 2650);
  assert.equal(r.data.salePrice, 2173);
  assert.equal(r.data.specs.length, 1); // boş satır atıldı
  assert.equal(r.data.weightKg, 21);
});

test("ürün formu: hatalı alanlar Türkçe mesajla döner", () => {
  const r = productInputSchema.safeParse(
    productFormToObject(form({ name: "ab", price: "abc", salePrice: "", sku: "!!", barcode: "1234567890123", weightKg: "", vatRate: "18" })),
  );
  assert.equal(r.success, false);
  const e = fieldErrors(r.error!);
  assert.match(e.name, /en az 3/);
  assert.match(e.price, /geçerli bir tutar/);
  assert.match(e.sku, /Ürün kodu/);
  assert.match(e.barcode, /kontrol hanesi/);
  assert.match(e.weightKg, /Ağırlık/);
  assert.match(e.vatRate, /KDV/);
});

test("indirimli fiyat satış fiyatından düşük olmalı", () => {
  const r = productInputSchema.safeParse(productFormToObject(form({ salePrice: "3.000,00" })));
  assert.equal(r.success, false);
  assert.match(fieldErrors(r.error!).salePrice, /düşük olmalı/);
});

test("kampanya fiyatı: en düşük geçerli fiyat seçilir", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const p = { id: "p", price: 1000, salePrice: 900, categoryId: "sub", categoryParentId: "main", brandId: "b" };
  const rule = (o: object) => ({ type: "PERCENT" as const, value: 20, target: "CATEGORY" as const, targetId: "main", startsAt: new Date("2026-11-01"), endsAt: new Date("2026-11-30"), isActive: true, ...o });
  assert.equal(effectivePrice(p, [], now).price, 900);
  assert.equal(effectivePrice(p, [rule({})], now).price, 800);
  assert.equal(effectivePrice(p, [rule({ endsAt: new Date("2026-11-05") })], now).price, 900); // süresi dolmuş
  assert.equal(effectivePrice(p, [rule({ type: "FIXED", value: 5000 })], now).price, 0); // negatife inmez
});
