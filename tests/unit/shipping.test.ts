import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateShipping, chargeableWeight, desi, suggestProfile, type ProfileTariff } from "../../src/lib/shipping";

const dims = (weightKg: number, a: number, b: number, c: number) => ({ weightKg, widthCm: a, heightCm: b, lengthCm: c });

test("desi yukarı yuvarlanır", () => {
  assert.equal(desi(dims(1, 30, 30, 30)), 9); // 27000/3000 = 9
  assert.equal(desi(dims(1, 31, 30, 30)), 10); // 9.3 → 10
});

test("ücrete esas ağırlık = max(kg, desi)", () => {
  assert.equal(chargeableWeight(dims(25, 40, 30, 10)), 25);
  assert.equal(chargeableWeight(dims(2, 60, 50, 40)), 40);
});

test("profil önerisi", () => {
  assert.equal(suggestProfile(dims(21, 30, 30, 35)).code, "STD"); // 15 L boya
  assert.equal(suggestProfile(dims(25, 60, 40, 12), { bulkMaterial: true }).code, "AGIR"); // torba
  assert.equal(suggestProfile(dims(40, 40, 40, 40)).code, "AGIR");
  assert.equal(suggestProfile(dims(8, 300, 5, 5)).code, "HACIM"); // 3 m profil
  assert.equal(suggestProfile(dims(5, 80, 80, 80)).code, "HACIM"); // desi 171
  assert.equal(suggestProfile(dims(60, 40, 40, 40)).code, null); // 50 kg üstü
  assert.equal(suggestProfile(dims(5, 310, 5, 5)).code, null); // 300 cm üstü
});

const tariffs: Record<"STD" | "AGIR" | "HACIM", ProfileTariff> = {
  STD: { code: "STD", packing: "COMBINED", baseIncludes: 0, basePrice: 120, unitPrice: 0, freeShippingEligible: true,
    tiers: [{ min: 0, max: 5, price: 120 }, { min: 5, max: 10, price: 160 }, { min: 10, max: 20, price: 220 }, { min: 20, max: 30, price: 290 }, { min: 30, max: 50, price: 400 }] },
  AGIR: { code: "AGIR", packing: "PER_PIECE", baseIncludes: 30, basePrice: 180, unitPrice: 8, freeShippingEligible: false, tiers: [] },
  HACIM: { code: "HACIM", packing: "PER_PIECE", baseIncludes: 30, basePrice: 160, unitPrice: 6, freeShippingEligible: false, tiers: [] },
};

test("SRS 9.2 örnek sepeti: 120 + 720 + 320 = 1.160 ₺", () => {
  const r = calculateShipping(
    [
      { qty: 2, profile: "STD", dims: dims(0.4, 6, 6, 25) }, // silikon (1 desi)
      { qty: 1, profile: "STD", dims: dims(0.6, 25, 10, 10) }, // rulo seti
      { qty: 4, profile: "AGIR", dims: dims(25, 60, 40, 12) }, // çimento
      { qty: 2, profile: "HACIM", dims: dims(3, 300, 5, 5) }, // profil (3 desi)
    ],
    tariffs,
  );
  assert.equal(r.total, 1160);
  assert.equal(r.packages.length, 3);
});

test("standart koli 30 kg'ı aşınca ikinci koli", () => {
  const r = calculateShipping([{ qty: 2, profile: "STD", dims: dims(21, 30, 30, 35) }], tariffs);
  assert.equal(r.packages.length, 2);
  assert.equal(r.total, 580); // 2 × 21 kg → 2 × 290
});

test("ücretsiz kargo yalnız standart profilde", () => {
  const r = calculateShipping(
    [
      { qty: 1, profile: "STD", dims: dims(1, 10, 10, 10) },
      { qty: 1, profile: "AGIR", dims: dims(35, 60, 40, 12) },
    ],
    tariffs,
    { cartTotal: 3000, freeShippingThreshold: 2500 },
  );
  assert.equal(r.packages[0].fee, 0);
  assert.equal(r.packages[1].fee, 180 + 5 * 8);
});

test("K3: ürüne özel ücretsiz kargo ücretli koliye ağırlık eklemez", () => {
  const r = calculateShipping(
    [
      { qty: 1, profile: "STD", dims: dims(4, 10, 10, 10), freeShipping: true },
      { qty: 1, profile: "STD", dims: dims(3, 10, 10, 10) },
    ],
    tariffs,
  );
  assert.equal(r.total, 120); // yalnız 3 kg'lık koli (0-5 kademesi); 4 kg'lık ücretsiz ürün eklenseydi 160 olurdu
  assert.deepEqual(r.packages.map((p) => p.fee), [0, 120]);
});

test("K4: eşik tam tutarda uygulanır, altında uygulanmaz", () => {
  const line = [{ qty: 1, profile: "STD" as const, dims: dims(1, 10, 10, 10) }];
  assert.equal(calculateShipping(line, tariffs, { cartTotal: 2500, freeShippingThreshold: 2500 }).total, 0);
  assert.equal(calculateShipping(line, tariffs, { cartTotal: 2499.99, freeShippingThreshold: 2500 }).total, 120);
  assert.equal(calculateShipping(line, tariffs, { cartTotal: 5000, freeShippingThreshold: null }).total, 120);
});

test("çift ücretlendirme yok: her parça tam bir pakette, toplam = paketlerin toplamı", () => {
  const lines = [
    { qty: 3, profile: "STD" as const, dims: dims(12, 30, 30, 30) },
    { qty: 1, profile: "STD" as const, dims: dims(1, 10, 10, 10), freeShipping: true },
    { qty: 2, profile: "AGIR" as const, dims: dims(40, 60, 40, 12) },
    { qty: 1, profile: "HACIM" as const, dims: dims(5, 250, 10, 10), freeShipping: true },
  ];
  const r = calculateShipping(lines, tariffs, { methodFee: 25 });
  const units = r.packages.reduce((n, p) => n + p.units, 0);
  assert.equal(units, 3 + 1 + 2 + 1);
  assert.equal(r.total, r.packages.reduce((s, p) => s + p.fee, 0) + 25);
  // 3 × 12 kg → 24 + 12 → iki koli: 290 + 220; ağır 2 × (180 + 10×8) = 520; hacimli ücretsiz
  assert.equal(r.total, 290 + 220 + 520 + 0 + 25);
});

test("K5: teslimat yöntemi ek ücreti sipariş başına bir kez; boş sepette kargo yok", () => {
  const r = calculateShipping(
    [
      { qty: 1, profile: "STD", dims: dims(1, 10, 10, 10) },
      { qty: 1, profile: "AGIR", dims: dims(35, 60, 40, 12) },
    ],
    tariffs,
    { methodFee: 50 },
  );
  assert.equal(r.methodFee, 50);
  assert.equal(r.total, 120 + 220 + 50);
  assert.equal(calculateShipping([], tariffs, { methodFee: 50 }).total, 0);
});
