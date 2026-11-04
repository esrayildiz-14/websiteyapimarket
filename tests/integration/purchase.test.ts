// Satın alma ve mal kabul: stok yalnız mal kabulde artar, fazla kabul ve eşzamanlı kabul sınırı aşamaz,
// ağırlıklı ortalama maliyet ve stok hareketinin kaynağı doğru yazılır.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { load, uniq } from "./setup";

let L: Awaited<ReturnType<typeof load>>;
let P: typeof import("@/server/purchase-admin");
let user: { id: string; email: string; name: string; roleKey: string; roleName: string; permissions: Set<string>; mfaEnabled: boolean };

before(async () => {
  L = await load();
  P = await import("@/server/purchase-admin");
  const u = await L.prisma.user.findFirstOrThrow({ where: { type: "STAFF" } });
  user = { id: u.id, email: u.email, name: "Test", roleKey: "SUPER_ADMIN", roleName: "Super Admin", permissions: new Set(["*"]), mfaEnabled: false };
});
after(async () => L.prisma.$disconnect());

async function setup(stock: number) {
  const { prisma } = L;
  const sku = uniq("PUR");
  const id = "p" + sku.toLowerCase();
  const [cat, prof] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } }),
    prisma.shippingProfile.findFirstOrThrow({ where: { code: "STD" } }),
  ]);
  await prisma.product.create({
    data: { id, sku, slug: id, name: `Satın alma ${sku}`, categoryId: cat.id, shippingProfileId: prof.id, price: 200, vatRate: 20,
      weightKg: 1, widthCm: 10, heightCm: 10, lengthCm: 10, status: "ACTIVE", inventory: { create: { quantity: 0 } } },
  });
  if (stock) await prisma.$transaction((tx) => L.adjustStock(tx, { productId: id }, stock, "PURCHASE_IN", { note: "açılış" }));
  await prisma.product.update({ where: { id }, data: { avgCost: stock ? 80 : null } });
  const supplier = await prisma.supplier.create({ data: { code: uniq("TED"), name: "Test Tedarik" } });
  await prisma.supplierProduct.create({ data: { supplierId: supplier.id, productId: id, purchasePrice: 100, discountPct: 10 } });
  const r = await P.createPurchaseOrder(user, { supplierId: supplier.id, warehouseId: "wh_merkez" });
  assert.equal(r.ok, true);
  const poId = (r as { id: string }).id;
  assert.equal((await P.addPurchaseItem(user, poId, { code: sku, quantity: "10" })).ok, true);
  return { productId: id, sku, poId, supplierId: supplier.id };
}

const stock = async (productId: string) => (await L.prisma.inventory.findUniqueOrThrow({ where: { productId } })).quantity;
const doc = (n: string) => ({ documentType: "IRSALIYE", documentNo: n, documentDate: new Date().toISOString().slice(0, 10) });

describe("satın alma ve mal kabul", () => {
  test("sipariş, onay ve iletim stoğu değiştirmez; tedarikçi fiyatı ve iskontosu satıra gelir", async () => {
    const s = await setup(5);
    const item = await L.prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: s.poId } });
    assert.deepEqual([Number(item.unitPrice), Number(item.discountPct), Number(item.lineNet), Number(item.lineVat)], [100, 10, 900, 180]);
    const po = await L.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: s.poId } });
    assert.deepEqual([Number(po.subtotal), Number(po.discountTotal), Number(po.vatTotal), Number(po.grandTotal)], [900, 100, 180, 1080]);
    assert.equal((await P.receiveGoods(user, s.poId, doc("I-0"), { [item.id]: 1 })).ok, false); // taslakta mal kabul yok
    assert.equal((await P.submitPurchase(user, s.poId)).ok, true);
    assert.equal((await P.approvePurchase(user, s.poId)).ok, true);
    assert.equal(await stock(s.productId), 5);
  });

  test("kısmi + tam mal kabul: stok depoya girer, hareketin kaynağı mal kabul, ortalama maliyet güncellenir, fazla kabul reddedilir", async () => {
    const s = await setup(5); // elde 5 adet, maliyet 80
    await P.submitPurchase(user, s.poId);
    await P.approvePurchase(user, s.poId);
    const item = await L.prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: s.poId } });
    const r1 = await P.receiveGoods(user, s.poId, doc("IRS-1"), { [item.id]: 4 });
    assert.equal(r1.ok, true, r1.message);
    assert.equal(await stock(s.productId), 9);
    let po = await L.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: s.poId } });
    assert.equal(po.status, "PARTIAL");
    // (5×80 + 4×90) / 9 = 84,4444
    assert.equal(Number((await L.prisma.product.findUniqueOrThrow({ where: { id: s.productId } })).avgCost), 84.4444);
    const mv = await L.prisma.inventoryMovement.findFirstOrThrow({ where: { productId: s.productId, goodsReceiptId: { not: null } } });
    assert.equal(mv.type, "PURCHASE_IN");
    assert.equal(mv.quantity, 4);
    assert.equal(mv.warehouseId, "wh_merkez");

    const over = await P.receiveGoods(user, s.poId, doc("IRS-2"), { [item.id]: 7 });
    assert.equal(over.ok, false);
    assert.match(over.message, /en fazla 6/);
    const dupDoc = await P.receiveGoods(user, s.poId, doc("IRS-1"), { [item.id]: 1 });
    assert.equal(dupDoc.ok, false); // aynı belge ikinci kez işlenmez
    assert.equal((await P.receiveGoods(user, s.poId, doc("IRS-3"), { [item.id]: 6 })).ok, true);
    po = await L.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: s.poId } });
    assert.equal(po.status, "RECEIVED");
    assert.ok(po.receivedAt);
    assert.equal(await stock(s.productId), 15);
    const sp = await L.prisma.supplierProduct.findFirstOrThrow({ where: { supplierId: s.supplierId, productId: s.productId } });
    assert.equal(Number(sp.lastPurchasePrice), 90);
    assert.equal((await P.cancelPurchase(user, s.poId, "deneme")).ok, false); // teslim alınmış sipariş iptal edilemez
  });

  test("aynı anda iki mal kabul: toplam sipariş edileni aşamaz", async () => {
    const s = await setup(0);
    await P.submitPurchase(user, s.poId);
    await P.approvePurchase(user, s.poId);
    const item = await L.prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: s.poId } });
    const rs = await Promise.all([
      P.receiveGoods(user, s.poId, doc("A-1"), { [item.id]: 7 }),
      P.receiveGoods(user, s.poId, doc("B-1"), { [item.id]: 7 }),
    ]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(await stock(s.productId), 7);
    assert.equal((await L.prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: item.id } })).receivedQty, 7);
    // depo kaydı olmayan ürün: ilk maliyet doğrudan mal kabul maliyeti
    assert.equal(Number((await L.prisma.product.findUniqueOrThrow({ where: { id: s.productId } })).avgCost), 90);
  });

  test("dört göz: oluşturan kişi kendi siparişini onaylayamaz (Super Admin hariç)", async () => {
    const s = await setup(0);
    await P.submitPurchase(user, s.poId);
    const plain = { ...user, roleKey: "ADMIN", permissions: new Set(["purchase.approve"]) };
    const r = await P.approvePurchase(plain, s.poId);
    assert.equal(r.ok, false);
    assert.match(r.message, /Kendi oluşturduğunuz/);
    assert.equal((await L.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: s.poId } })).status, "PENDING_APPROVAL");
  });

  test("iptal nedeni zorunlu; iptal edilen siparişe ürün eklenemez", async () => {
    const s = await setup(0);
    assert.equal((await P.cancelPurchase(user, s.poId, "")).ok, false);
    assert.equal((await P.cancelPurchase(user, s.poId, "Tedarikçi fiyatı değişti")).ok, true);
    assert.equal((await P.addPurchaseItem(user, s.poId, { code: s.sku, quantity: "1" })).ok, false);
  });
});
