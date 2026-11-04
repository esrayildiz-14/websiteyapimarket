import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, byDim, istanbulDayStart, istanbulMonthStart, periodKey, toCsv, type Fact } from "../../src/lib/report-calc";

const f = (o: Partial<Fact>): Fact => ({
  date: new Date("2026-11-04T09:00:00Z"), channel: "ONLINE", productId: "p1", productName: "Matkap", sku: "M1", category: "Elektrikli", brand: "Bosch",
  customer: "Ayşe", qty: 1, gross: 120, vat: 20, unitCost: 60, costSource: "ortalama", ...o,
});

test("dönem anahtarı Türkiye saatine göre; ISO hafta", () => {
  assert.equal(periodKey(new Date("2026-11-03T22:30:00Z"), "gun"), "2026-11-04"); // TR 01:30
  assert.equal(periodKey(new Date("2026-11-04T09:00:00Z"), "ay"), "2026-11");
  assert.equal(periodKey(new Date("2026-11-04T09:00:00Z"), "yil"), "2026");
  assert.equal(periodKey(new Date("2026-01-01T09:00:00Z"), "hafta"), "2026-H01");
  assert.equal(periodKey(new Date("2026-11-04T09:00:00Z"), "hafta"), "2026-H45");
});

test("toplama: net = brüt − KDV, maliyet, brüt kâr, marj; iade negatif düşer", () => {
  const rows = aggregate([f({}), f({ qty: 2, gross: 240, vat: 40 }), f({ qty: -1, gross: -120, vat: -20 })], byDim("urun"));
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].qty, rows[0].gross, rows[0].net, rows[0].cogs, rows[0].gross_profit, rows[0].margin], [2, 240, 200, 120, 80, 40]);
});

test("maliyeti bilinmeyen satış: marj verilmez, eksik maliyetli adet raporlanır", () => {
  const rows = aggregate([f({}), f({ unitCost: null, costSource: "yok" })], byDim("kanal"));
  assert.equal(rows[0].uncostedQty, 1);
  assert.equal(rows[0].margin, null);
  assert.equal(rows[0].label, "Online");
});

test("CSV: noktalı virgül, ondalık virgül, tırnak kaçışı, BOM", () => {
  const csv = toCsv(["Ürün", "Tutar"], [['Boya "beyaz"; 2,5 L', 12.5]]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv.slice(1), 'Ürün;Tutar\r\n"Boya ""beyaz""; 2,5 L";12,5');
});

test("gün ve ay başı İstanbul saatine göre: UTC 22:30 = İstanbul'da ertesi gün 01:30", () => {
  const t = new Date("2026-10-31T22:30:00Z"); // İstanbul: 1 Kasım 01:30
  assert.equal(istanbulDayStart(t).toISOString(), "2026-10-31T21:00:00.000Z");
  assert.equal(istanbulMonthStart(t).toISOString(), "2026-10-31T21:00:00.000Z");
  const u = new Date("2026-11-15T12:00:00Z");
  assert.equal(istanbulDayStart(u).toISOString(), "2026-11-14T21:00:00.000Z");
  assert.equal(istanbulMonthStart(u).toISOString(), "2026-10-31T21:00:00.000Z");
});
