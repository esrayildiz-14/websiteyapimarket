// Depo bazlı stok: varsayılan depo, transfer, online/offline depo, satışta depo seçimi, eşzamanlılık.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { load, uniq } from "./setup";

type L = Awaited<ReturnType<typeof load>>;
let L: L;

async function product(stock: number) {
  const { prisma } = L;
  const sku = uniq("INT");
  const id = "i" + sku.toLowerCase();
  const [cat, prof] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { parentId: { not: null } } }),
    prisma.shippingProfile.findFirstOrThrow({ where: { code: "STD" } }),
  ]);
  await prisma.product.create({
    data: {
      id, sku, slug: id, name: `Entegrasyon ${sku}`, categoryId: cat.id, shippingProfileId: prof.id, price: 100,
      weightKg: 1, widthCm: 10, heightCm: 10, lengthCm: 10, status: "ACTIVE",
      inventory: { create: { quantity: stock } }, // depo kaydı OLMADAN (eski veri gibi)
    },
  });
  return { productId: id };
}

async function warehouse(sellsOnline: boolean) {
  const code = uniq("WH");
  return L.prisma.warehouse.create({ data: { code, name: `Depo ${code}`, sellsOnline } });
}

async function state(key: { productId: string }) {
  const inv = await L.prisma.inventory.findUniqueOrThrow({ where: { productId: key.productId }, include: { warehouseStocks: true } });
  const by = Object.fromEntries(inv.warehouseStocks.map((s) => [s.warehouseId, s.quantity]));
  return { quantity: inv.quantity, reserved: inv.reserved, by };
}

const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) => L.prisma.$transaction(fn);

before(async () => {
  L = await load();
});
after(async () => {
  await L.prisma.$disconnect();
});

describe("depo bazlı stok", () => {
  test("migration varsayılan 'Merkez Depo'yu oluşturur", async () => {
    const def = await L.prisma.warehouse.findMany({ where: { isDefault: true } });
    assert.equal(def.length, 1);
    assert.equal(def[0].code, "MERKEZ");
    assert.equal(def[0].sellsOnline, true);
  });

  test("depo kaydı olmayan eski stok ilk işlemde varsayılan depoya alınır; toplam bozulmaz", async () => {
    const key = await product(10);
    const def = await tx((t) => L.defaultWarehouse(t));
    const after = await tx((t) => L.adjustStock(t, key, 5, "PURCHASE_IN", { note: "test" }));
    assert.equal(after, 15);
    const s = await state(key);
    assert.equal(s.quantity, 15);
    assert.deepEqual(s.by, { [def.id]: 15 });
  });

  test("online depodan online olmayan depoya transfer satılabilir stoğu düşürür; geri transfer artırır", async () => {
    const key = await product(10);
    const def = await tx((t) => L.defaultWarehouse(t));
    const off = await warehouse(false);
    const r = await tx((t) => L.transferStock(t, key, def.id, off.id, 6, {}));
    assert.deepEqual(r, { from: 4, to: 6 });
    let s = await state(key);
    assert.equal(s.quantity, 4);
    assert.equal(s.by[off.id], 6);
    await tx((t) => L.transferStock(t, key, off.id, def.id, 2, {}));
    s = await state(key);
    assert.equal(s.quantity, 6);
    assert.equal(s.by[off.id], 4);
    const mv = await L.prisma.inventoryMovement.findMany({ where: { productId: key.productId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(mv.map((m) => [m.type, m.quantity, m.warehouseId]), [
      ["TRANSFER_OUT", -6, def.id], ["TRANSFER_IN", 6, off.id], ["TRANSFER_OUT", -2, off.id], ["TRANSFER_IN", 2, def.id],
    ]);
  });

  test("depoda olmayan adet transfer edilemez, hiçbir şey değişmez", async () => {
    const key = await product(3);
    const def = await tx((t) => L.defaultWarehouse(t));
    const off = await warehouse(false);
    await assert.rejects(tx((t) => L.transferStock(t, key, def.id, off.id, 4, {})), L.StockError);
    const s = await state(key);
    assert.equal(s.quantity, 3);
    assert.equal(s.by[off.id], undefined);
  });

  test("ödeme bekleyen siparişlere ayrılan adet online olmayan depoya taşınamaz", async () => {
    const key = await product(5);
    const def = await tx((t) => L.defaultWarehouse(t));
    const off = await warehouse(false);
    await tx((t) => L.reserve(t, key, 4));
    await assert.rejects(tx((t) => L.transferStock(t, key, def.id, off.id, 2, {})), /ayrılan/);
    await tx((t) => L.transferStock(t, key, def.id, off.id, 1, {}));
    assert.deepEqual(await state(key).then((s) => [s.quantity, s.reserved]), [4, 4]);
  });

  test("satış önce varsayılan depodan, yetmezse diğer online depodan düşer; online olmayan depoya dokunmaz", async () => {
    const key = await product(10);
    const def = await tx((t) => L.defaultWarehouse(t));
    const on2 = await warehouse(true);
    const off = await warehouse(false);
    await tx((t) => L.transferStock(t, key, def.id, on2.id, 4, {})); // merkez 6, on2 4
    await tx((t) => L.transferStock(t, key, def.id, off.id, 2, {})); // merkez 4, off 2 → satılabilir 8
    assert.equal((await state(key)).quantity, 8);
    await tx(async (t) => {
      await L.reserve(t, key, 7);
      await L.commitSale(t, key, 7, { note: "test satış" });
    });
    const s = await state(key);
    assert.deepEqual([s.quantity, s.reserved, s.by[def.id], s.by[on2.id], s.by[off.id]], [1, 0, 0, 1, 2]);
    const sales = await L.prisma.inventoryMovement.findMany({ where: { productId: key.productId, type: "SALE_OUT" }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(sales.map((m) => [m.warehouseId, m.quantity]), [[def.id, -4], [on2.id, -3]]);
  });

  test("aynı anda iki çıkış: stok eksiye düşmez, biri reddedilir", async () => {
    const key = await product(6);
    await tx((t) => L.adjustStock(t, key, 1, "PURCHASE_IN", {})); // depo kaydı oluşsun: 7
    const results = await Promise.allSettled([
      tx((t) => L.adjustStock(t, key, -5, "DAMAGE_OUT", { note: "a" })),
      tx((t) => L.adjustStock(t, key, -5, "WASTE_OUT", { note: "b" })),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const s = await state(key);
    assert.equal(s.quantity, 2);
  });

  test("setStock satılabilir toplamı hedefe getirir, farkı varsayılan depoya yazar", async () => {
    const key = await product(10);
    const def = await tx((t) => L.defaultWarehouse(t));
    const on2 = await warehouse(true);
    await tx((t) => L.transferStock(t, key, def.id, on2.id, 3, {})); // merkez 7, on2 3
    await tx((t) => L.setStock(t, key, 12, {}));
    const s = await state(key);
    assert.deepEqual([s.quantity, s.by[def.id], s.by[on2.id]], [12, 9, 3]);
    await assert.rejects(tx((t) => L.setStock(t, key, 2, {})), L.StockError); // merkez 9−10 < 0
  });

  test("pasif depoda stok hareketi yapılamaz", async () => {
    const key = await product(5);
    const off = await L.prisma.warehouse.create({ data: { code: uniq("WH"), name: "Pasif depo", sellsOnline: false, isActive: false } });
    await assert.rejects(tx((t) => L.adjustStock(t, key, 1, "PURCHASE_IN", { warehouseId: off.id })), /pasif/);
  });

  test("satılabilir toplam ile online depo toplamı tüm kalemlerde uyuşur", async () => {
    const rows = await L.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT i.id FROM inventory i JOIN warehouse_stocks s ON s."inventoryId" = i.id JOIN warehouses w ON w.id = s."warehouseId"
        GROUP BY i.id, i.quantity HAVING i.quantity <> COALESCE(SUM(s.quantity) FILTER (WHERE w."sellsOnline"), 0)) x`;
    assert.equal(rows[0].n, 0);
  });
});
