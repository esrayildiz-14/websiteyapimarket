// Mağaza kasası: fiyat sunucudan, depo stoğu düşer; online sipariş ayırmasıyla eşzamanlı güvenli; iptal ve iade.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { load, uniq } from "./setup";

let L: Awaited<ReturnType<typeof load>>;
let POS: typeof import("@/server/pos");
type U = Parameters<typeof import("@/server/pos")["completeSale"]>[0];
let u: U;

before(async () => {
  L = await load();
  POS = await import("@/server/pos");
  const x = await L.prisma.user.findFirstOrThrow({ where: { type: "STAFF" } });
  u = { id: x.id, email: x.email, name: "Kasa", roleKey: "SUPER_ADMIN", roleName: "SA", permissions: new Set(["*"]), mfaEnabled: false };
});
after(async () => L.prisma.$disconnect());

async function product(stock: number, price = 120) {
  const sku = uniq("KAS");
  const id = "k" + sku.toLowerCase();
  const [cat, prof] = await Promise.all([
    L.prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } }),
    L.prisma.shippingProfile.findFirstOrThrow({ where: { code: "STD" } }),
  ]);
  await L.prisma.product.create({
    data: { id, sku, slug: id, name: `Kasa ${sku}`, categoryId: cat.id, shippingProfileId: prof.id, price, vatRate: 20,
      weightKg: 1, widthCm: 1, heightCm: 1, lengthCm: 1, status: "ACTIVE", inventory: { create: { quantity: 0 } } },
  });
  if (stock) await L.prisma.$transaction((tx) => L.adjustStock(tx, { productId: id }, stock, "PURCHASE_IN", {}));
  return { id, sku };
}
const qty = async (id: string) => (await L.prisma.inventory.findUniqueOrThrow({ where: { productId: id } })).quantity;

describe("mağaza kasası", () => {
  test("satış: fiyat veritabanından (istemci fiyatı yok sayılır), stok düşer, kart+nakit ve para üstü", async () => {
    const p = await product(5, 120);
    const r = await POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: p.id, quantity: 2, unitPrice: 1 }], card: 100, cashGiven: 200 });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.grandTotal, 240);
    assert.equal(r.change, 60);
    assert.equal(await qty(p.id), 3);
    const s = await L.prisma.storeSale.findUniqueOrThrow({ where: { id: r.id }, include: { payments: true } });
    assert.equal(Number(s.vatTotal), 40);
    assert.deepEqual(s.payments.map((x) => [x.method, Number(x.amount)]).sort(), [["CARD", 100], ["CASH", 140]]);
    const mv = await L.prisma.inventoryMovement.findFirstOrThrow({ where: { storeSaleId: r.id } });
    assert.deepEqual([mv.type, mv.quantity], ["SALE_OUT", -2]);
  });

  test("eksik ödeme ve satırı aşan indirim reddedilir; stok değişmez", async () => {
    const p = await product(5, 100);
    assert.equal((await POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: p.id, quantity: 1 }], cashGiven: 50 })).ok, false);
    assert.equal((await POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: p.id, quantity: 1, discount: 150 }], cashGiven: 100 })).ok, false);
    assert.equal(await qty(p.id), 5);
  });

  test("online siparişe ayrılan son ürün kasadan satılamaz; aynı anda iki kasa satışında yalnız biri geçer", async () => {
    const a = await product(1);
    await L.prisma.$transaction((tx) => L.reserve(tx, { productId: a.id }, 1));
    const r = await POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: a.id, quantity: 1 }], cashGiven: 120 });
    assert.equal(r.ok, false);
    assert.equal(await qty(a.id), 1);

    const b = await product(1);
    const rs = await Promise.all([1, 2].map(() => POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: b.id, quantity: 1 }], cashGiven: 120 })));
    assert.equal(rs.filter((x) => x.ok).length, 1);
    assert.equal(await qty(b.id), 0);
  });

  test("kısmi iade (sağlam + hasarlı), iade tutarları, iadeden sonra iptal yok; iptal stoğu ve parayı geri verir", async () => {
    const p = await product(10, 100);
    const r = await POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: p.id, quantity: 3 }], cartDiscount: 1, cashGiven: 299 });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const item = await L.prisma.storeSaleItem.findFirstOrThrow({ where: { storeSaleId: r.id } });
    assert.equal(Number(item.lineTotal), 299);
    const r1 = await POS.returnItems(u, r.id, [{ itemId: item.id, quantity: 1, restock: true }], "Beden uymadı", "CASH");
    assert.equal(r1.ok, true, r1.message);
    assert.equal(await qty(p.id), 8);
    const r2 = await POS.returnItems(u, r.id, [{ itemId: item.id, quantity: 2, restock: false }], "Kırık geldi", "CARD");
    assert.equal(r2.ok, true, r2.message);
    assert.equal(await qty(p.id), 8); // hasarlı: stoğa girmedi
    const s = await L.prisma.storeSale.findUniqueOrThrow({ where: { id: r.id }, include: { returns: true } });
    assert.equal(Number(s.refundedTotal), 299); // 99,67 + 199,33
    assert.deepEqual(s.returns.map((x) => Number(x.total)).sort(), [199.33, 99.67]);
    assert.equal((await POS.returnItems(u, r.id, [{ itemId: item.id, quantity: 1, restock: true }], "fazla", "CASH")).ok, false);
    assert.equal((await POS.cancelSale(u, r.id, "deneme")).ok, false);
    const dmg = await L.prisma.inventoryMovement.findFirstOrThrow({ where: { storeSaleId: r.id, type: "DAMAGE_OUT" } });
    assert.equal(dmg.quantity, -2);

    const p2 = await product(4, 50);
    const r3 = await POS.completeSale(u, { warehouseId: "wh_merkez", items: [{ productId: p2.id, quantity: 2 }], card: 100 });
    assert.equal(r3.ok, true);
    if (!r3.ok) return;
    assert.equal(await qty(p2.id), 2);
    assert.equal((await POS.cancelSale(u, r3.id, "Yanlış ürün okutuldu")).ok, true);
    assert.equal(await qty(p2.id), 4);
    const pays = await L.prisma.storePayment.findMany({ where: { storeSaleId: r3.id } });
    assert.equal(pays.reduce((a, x) => a + Number(x.amount), 0), 0);
  });
});
