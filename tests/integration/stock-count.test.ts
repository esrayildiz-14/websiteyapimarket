// Stok sayımı: ilk okutmadaki sistem adedi esas alınır, sayım sırasında olan hareketler korunur;
// tam sayımda okutulmayanlar 0'a çekilir; dört göz; ödeme bekleyen ayırmanın altına inilmez.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { load, uniq } from "./setup";

let L: Awaited<ReturnType<typeof load>>;
let C: typeof import("@/server/stock-count");
type U = Parameters<typeof import("@/server/stock-count")["scan"]>[0];
let su: U;
let plain: U;

before(async () => {
  L = await load();
  C = await import("@/server/stock-count");
  const u = await L.prisma.user.findFirstOrThrow({ where: { type: "STAFF" } });
  su = { id: u.id, email: u.email, name: "Test", roleKey: "SUPER_ADMIN", roleName: "SA", permissions: new Set(["*"]), mfaEnabled: false };
  plain = { ...su, roleKey: "ADMIN", permissions: new Set(["stockcount.write", "stockcount.approve"]) };
});
after(async () => L.prisma.$disconnect());

async function product(stock: number, warehouseId: string) {
  const { prisma } = L;
  const sku = uniq("SAY");
  const id = "s" + sku.toLowerCase();
  const [cat, prof] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } }),
    prisma.shippingProfile.findFirstOrThrow({ where: { code: "STD" } }),
  ]);
  await prisma.product.create({
    data: { id, sku, slug: id, barcode: String(Date.now()).slice(-12) + String(Math.floor(Math.random() * 9)), name: `Sayım ${sku}`, categoryId: cat.id, shippingProfileId: prof.id,
      price: 50, weightKg: 1, widthCm: 1, heightCm: 1, lengthCm: 1, status: "ACTIVE", inventory: { create: { quantity: 0 } } },
  });
  if (stock) await prisma.$transaction((tx) => L.adjustStock(tx, { productId: id }, stock, "PURCHASE_IN", { warehouseId }));
  return { id, sku };
}

async function freshWarehouse() {
  return L.prisma.warehouse.create({ data: { code: uniq("SW"), name: "Sayım deposu", sellsOnline: true } });
}
const wqty = async (productId: string, warehouseId: string) =>
  (await L.prisma.warehouseStock.findFirst({ where: { warehouseId, inventory: { productId } } }))?.quantity ?? 0;

describe("stok sayımı", () => {
  test("okutma: ekle ve ayarla kipleri; bilinmeyen barkod reddedilir; aynı depoda ikinci açık sayım açılamaz", async () => {
    const wh = await freshWarehouse();
    const p = await product(10, wh.id);
    const s = await C.startCount(plain, wh.id, "");
    assert.equal(s.ok, true);
    const id = (s as { id: string }).id;
    assert.equal((await C.startCount(plain, wh.id, "")).ok, false);
    assert.equal((await C.scan(plain, id, { code: p.sku, quantity: 1, mode: "add" })).ok, true);
    const r2 = await C.scan(plain, id, { code: p.sku, quantity: 1, mode: "add" });
    assert.equal(r2.ok && r2.counted, 2);
    const r3 = await C.scan(plain, id, { code: p.sku, quantity: 8, mode: "set" });
    assert.equal(r3.ok && r3.counted, 8);
    assert.equal((await C.scan(plain, id, { code: "YOK-123456", quantity: 1, mode: "add" })).ok, false);
    const line = await L.prisma.stockCountLine.findFirstOrThrow({ where: { stockCountId: id } });
    assert.deepEqual([line.systemQty, line.countedQty], [10, 8]);
    assert.equal(await wqty(p.id, wh.id), 10); // okutma stoğu değiştirmez
  });

  test("onay: sayım sırasındaki satış/giriş korunur; dört göz; fark hareketi sayıma bağlanır", async () => {
    const wh = await freshWarehouse();
    const p = await product(10, wh.id);
    const id = ((await C.startCount(plain, wh.id, "")) as { id: string }).id;
    await C.scan(plain, id, { code: p.sku, quantity: 7, mode: "set" }); // 10 bekleniyordu, 7 sayıldı → −3
    // sayım sürerken 4 adet mal kabul edildi
    await L.prisma.$transaction((tx) => L.adjustStock(tx, { productId: p.id }, 4, "PURCHASE_IN", { warehouseId: wh.id }));
    assert.equal((await C.submitCount(plain, id, false)).ok, true);
    const self = await C.approveCount(plain, id);
    assert.equal(self.ok, false);
    assert.match(self.message, /Kendi başlattığınız/);
    const ok = await C.approveCount(su, id);
    assert.equal(ok.ok, true, ok.message);
    assert.equal(await wqty(p.id, wh.id), 11); // 14 − 3
    const mv = await L.prisma.inventoryMovement.findFirstOrThrow({ where: { stockCountId: id } });
    assert.deepEqual([mv.type, mv.quantity, mv.warehouseId], ["ADJUSTMENT", -3, wh.id]);
    assert.equal((await C.scan(plain, id, { code: p.sku, quantity: 1, mode: "add" })).ok, false); // onaylı sayıma okutma yok
  });

  test("tam sayım: okutulmayan ürünler 0'a çekilir; kısmi sayımda değişmez", async () => {
    const wh = await freshWarehouse();
    const a = await product(5, wh.id);
    const b = await product(3, wh.id);
    let id = ((await C.startCount(plain, wh.id, "")) as { id: string }).id;
    await C.scan(plain, id, { code: a.sku, quantity: 5, mode: "set" });
    await C.submitCount(plain, id, false);
    assert.equal((await C.approveCount(su, id)).ok, true);
    assert.equal(await wqty(b.id, wh.id), 3);

    id = ((await C.startCount(plain, wh.id, "")) as { id: string }).id;
    await C.scan(plain, id, { code: a.sku, quantity: 5, mode: "set" });
    const rep = await C.countReport(id);
    assert.equal(rep!.missing.some((m) => m.sku === b.sku), true);
    await C.submitCount(plain, id, true);
    assert.equal((await C.approveCount(su, id)).ok, true);
    assert.equal(await wqty(b.id, wh.id), 0);
    assert.equal(await wqty(a.id, wh.id), 5);
    const line = await L.prisma.stockCountLine.findFirstOrThrow({ where: { stockCountId: id, productId: b.id } });
    assert.deepEqual([line.systemQty, line.countedQty], [3, 0]);
  });

  test("ödeme bekleyen siparişe ayrılan adedin altına düzeltme yapılamaz; hiçbir satır uygulanmaz", async () => {
    const wh = await freshWarehouse();
    const a = await product(6, wh.id);
    const b = await product(6, wh.id);
    const id = ((await C.startCount(plain, wh.id, "")) as { id: string }).id;
    await C.scan(plain, id, { code: a.sku, quantity: 2, mode: "set" });
    await C.scan(plain, id, { code: b.sku, quantity: 1, mode: "set" });
    await L.prisma.$transaction((tx) => L.reserve(tx, { productId: b.id }, 4));
    await C.submitCount(plain, id, false);
    const r = await C.approveCount(su, id);
    assert.equal(r.ok, false);
    assert.equal(await wqty(a.id, wh.id), 6); // a da uygulanmadı (hepsi ya da hiçbiri)
    assert.equal((await L.prisma.stockCount.findUniqueOrThrow({ where: { id } })).status, "SUBMITTED");
  });
});
