// Raporlar gerçek kayıtlardan: mağaza satışı + iade → ürün bazında adet, net satış, maliyet, brüt kâr; finansal özet farkı.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, uniq } from "./setup";

let L: Awaited<ReturnType<typeof load>>;
let POS: typeof import("@/server/pos");
let R: typeof import("@/server/reports");
let u: Parameters<typeof import("@/server/pos")["completeSale"]>[0];

before(async () => {
  L = await load();
  POS = await import("@/server/pos");
  R = await import("@/server/reports");
  const x = await L.prisma.user.findFirstOrThrow({ where: { type: "STAFF" } });
  u = { id: x.id, email: x.email, name: "R", roleKey: "SUPER_ADMIN", roleName: "SA", permissions: new Set(["*"]), mfaEnabled: false };
});
after(async () => L.prisma.$disconnect());

test("mağaza satışı ve iadesi rapora doğru yansır; maliyet ortalama maliyetten", async () => {
  const sku = uniq("RAP");
  const id = "r" + sku.toLowerCase();
  const [cat, prof] = await Promise.all([
    L.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } }),
    L.prisma.shippingProfile.findFirstOrThrow({ where: { code: "STD" } }),
  ]);
  await L.prisma.product.create({
    data: { id, sku, slug: id, name: `Rapor ${sku}`, categoryId: cat.id, shippingProfileId: prof.id, price: 120, vatRate: 20, avgCost: 60,
      weightKg: 1, widthCm: 1, heightCm: 1, lengthCm: 1, status: "ACTIVE", inventory: { create: { quantity: 0 } } },
  });
  await L.prisma.$transaction((tx) => L.adjustStock(tx, { productId: id }, 5, "PURCHASE_IN", {}));
  const input = { from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000), group: "gun" as const, dim: "urun" as const, includeTest: false };
  const before = await R.financialSummary(input);

  const s = await POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: id, quantity: 2 }], cashGiven: 240 });
  assert.equal(s.ok, true);
  if (!s.ok) return;
  const item = await L.prisma.storeSaleItem.findFirstOrThrow({ where: { storeSaleId: s.id } });
  assert.equal((await POS.returnItems(u, s.id, [{ itemId: item.id, quantity: 1, restock: true }], "İade", "CASH")).ok, true);

  const rep = await R.salesReport(input);
  const row = rep.dims.find((d) => d.key === id)!;
  assert.deepEqual([row.qty, row.gross, row.net, row.cogs, row.gross_profit, row.margin], [1, 120, 100, 60, 40, 40]);
  const ch = (await R.salesReport({ ...input, dim: "kanal" })).dims.find((d) => d.key === "MAGAZA");
  assert.ok(ch && ch.qty >= 1);

  const after = await R.financialSummary(input);
  const d = (k: "totalSales" | "returnsInPeriod" | "collected" | "refunded" | "netCash" | "cogs") => Math.round((after[k] - before[k]) * 100) / 100;
  assert.deepEqual([d("totalSales"), d("returnsInPeriod"), d("collected"), d("refunded"), d("netCash"), d("cogs")], [240, 120, 240, 120, 120, 60]);
  assert.equal(after.commission, null); // kayıt yoksa hesaplanmaz
});
