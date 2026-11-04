import "server-only";
import type { MovementType, Prisma } from "@/generated/prisma/client";

/**
 * Envanter işlemleri. Bütün stok değişiklikleri buradan geçer ve her biri:
 *  - tek bir SQL UPDATE ile koşullu yapılır (yarış durumunda stok eksiye düşmez),
 *  - inventory_movements tablosuna hareket kaydı yazar.
 * Fonksiyonlar bir işlem (transaction) içinde çağrılmalıdır.
 *
 * Kurallar
 *  - available = quantity − reserved (quantity = online satışa açık depoların toplamı)
 *  - reserve: ödeme bekleyen sipariş için adet ayırır (available yeterliyse)
 *  - commitSale: ödeme doğrulanınca ayrılan adedi stoktan düşer
 *  - release: ödeme başarısız / süre doldu → ayırmayı geri bırakır
 */
type Tx = Prisma.TransactionClient;
export type StockKey = { productId: string; variantId?: string | null };
type Meta = { userId?: string | null; orderId?: string | null; note?: string | null; goodsReceiptId?: string | null; stockCountId?: string | null };

export class StockError extends Error {
  constructor(message: string, public key: StockKey) {
    super(message);
  }
}

/** Kalemin envanter satırını getirir; yoksa 0 adetle oluşturur. */
export async function ensureInventory(tx: Tx, key: StockKey) {
  if (key.variantId) {
    return tx.inventory.upsert({ where: { variantId: key.variantId }, update: {}, create: { variantId: key.variantId } });
  }
  return tx.inventory.upsert({ where: { productId: key.productId }, update: {}, create: { productId: key.productId } });
}

// ---------------------------------------------------------------- depolar
//
// Depo kuralları
//  - Her envanter kaleminin her depoda fiziksel adedi warehouse_stocks tablosundadır.
//  - inventory.quantity = "online satışa açık" (sellsOnline) depolardaki adetlerin toplamıdır.
//    Sepet, ödeme ve stok ayırma kodu yalnız inventory satırıyla çalışır; depolar bu toplamı besler.
//  - Hareketin "stockAfter" değeri, hareketin yapıldığı depodaki yeni adettir.

type Wh = { id: string; sellsOnline: boolean; isActive: boolean; name: string };

export async function defaultWarehouse(tx: Tx): Promise<Wh> {
  const w = await tx.warehouse.findFirst({ where: { isDefault: true } });
  if (!w) throw new Error("Varsayılan depo tanımlı değil.");
  return w;
}

async function resolveWarehouse(tx: Tx, key: StockKey, warehouseId?: string | null): Promise<Wh> {
  if (!warehouseId) return defaultWarehouse(tx);
  const w = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!w) throw new StockError("Depo bulunamadı.", key);
  return w;
}

/**
 * Depo kaydı olmayan eski envanter satırları (depo altyapısından önce oluşmuş veya doğrudan eklenmiş)
 * varsayılan depoda tutuluyor sayılır: ilk depo işleminde adedi varsayılan depoya yazılır.
 */
async function adoptLegacy(tx: Tx, inventoryId: string) {
  await tx.$executeRaw`
    INSERT INTO warehouse_stocks (id, "warehouseId", "inventoryId", quantity, "updatedAt")
    SELECT 'ws_' || md5(random()::text || clock_timestamp()::text), w.id, i.id, i.quantity, now()
    FROM inventory i, warehouses w
    WHERE i.id = ${inventoryId} AND w."isDefault"
      AND NOT EXISTS (SELECT 1 FROM warehouse_stocks s WHERE s."inventoryId" = i.id)
    ON CONFLICT DO NOTHING`;
}

async function ensureWarehouseStock(tx: Tx, inventoryId: string, warehouseId: string) {
  await adoptLegacy(tx, inventoryId);
  await tx.$executeRaw`
    INSERT INTO warehouse_stocks (id, "warehouseId", "inventoryId", quantity, "updatedAt")
    VALUES ('ws_' || md5(random()::text || clock_timestamp()::text), ${warehouseId}, ${inventoryId}, 0, now())
    ON CONFLICT ("warehouseId", "inventoryId") DO NOTHING`;
}

async function movement(tx: Tx, key: StockKey, type: MovementType, quantity: number, stockAfter: number, meta: Meta, warehouseId: string) {
  await tx.inventoryMovement.create({
    data: {
      productId: key.productId,
      variantId: key.variantId ?? null,
      type,
      quantity,
      stockAfter,
      userId: meta.userId ?? null,
      orderId: meta.orderId ?? null,
      note: meta.note ?? null,
      warehouseId,
      goodsReceiptId: meta.goodsReceiptId ?? null,
      stockCountId: meta.stockCountId ?? null,
    },
  });
}

/**
 * Bir depoda stok girişi (+) veya çıkışı (−). Depo adedi eksiye düşemez; depo online satışa açıksa
 * satılabilir toplam da aynı miktarda değişir ve ödeme bekleyen siparişlere ayrılan adedin altına inemez.
 * Dönen değer: depodaki yeni adet.
 */
export async function adjustStock(tx: Tx, key: StockKey, delta: number, type: MovementType, meta: Meta & { warehouseId?: string | null } = {}) {
  if (!Number.isInteger(delta) || delta === 0) throw new StockError("Geçersiz stok miktarı.", key);
  const inv = await ensureInventory(tx, key);
  const wh = await resolveWarehouse(tx, key, meta.warehouseId);
  if (!wh.isActive) throw new StockError(`${wh.name} pasif; bu depoda stok hareketi yapılamaz.`, key);
  await ensureWarehouseStock(tx, inv.id, wh.id);
  const ws = await tx.$queryRaw<{ quantity: number }[]>`
    UPDATE warehouse_stocks SET quantity = quantity + ${delta}, "updatedAt" = now()
    WHERE "warehouseId" = ${wh.id} AND "inventoryId" = ${inv.id} AND quantity + ${delta} >= 0
    RETURNING quantity`;
  if (!ws.length) throw new StockError(`${wh.name}: depoda yeterli stok yok, stok negatif olamaz.`, key);
  if (wh.sellsOnline) {
    const rows = await tx.$queryRaw<{ quantity: number }[]>`
      UPDATE inventory SET quantity = quantity + ${delta}, "updatedAt" = now()
      WHERE id = ${inv.id} AND quantity + ${delta} >= reserved AND quantity + ${delta} >= 0
      RETURNING quantity`;
    if (!rows.length) throw new StockError("Stok negatif olamaz veya ödeme bekleyen siparişlere ayrılan adedin altına inemez.", key);
  }
  await movement(tx, key, type, delta, ws[0].quantity, meta, wh.id);
  return ws[0].quantity;
}

/**
 * Satılabilir toplam stoğu (online depolar) belirli bir değere getirir. Fark varsayılan depoya yazılır
 * (ürün formu ve eski stok ekranı bu anlamı kullanır). Dönen değer: yeni satılabilir toplam.
 */
export async function setStock(tx: Tx, key: StockKey, target: number, meta: Meta = {}) {
  const inv = await ensureInventory(tx, key);
  const locked = await tx.$queryRaw<{ quantity: number }[]>`SELECT quantity FROM inventory WHERE id = ${inv.id} FOR UPDATE`;
  const diff = target - locked[0].quantity;
  if (diff === 0) return target;
  const def = await defaultWarehouse(tx);
  if (!def.sellsOnline) throw new StockError("Varsayılan depo online satışa kapalı; stoğu depo ekranından düzeltin.", key);
  await adjustStock(tx, key, diff, "ADJUSTMENT", { ...meta, warehouseId: def.id });
  return target;
}

/** Bir depodaki güncel fiziksel adet (eski kayıt varsa önce varsayılan depoya alınır). */
export async function warehouseQty(tx: Tx, inventoryId: string, warehouseId: string) {
  await adoptLegacy(tx, inventoryId);
  const r = await tx.$queryRaw<{ quantity: number }[]>`
    SELECT quantity FROM warehouse_stocks WHERE "warehouseId" = ${warehouseId} AND "inventoryId" = ${inventoryId}`;
  return r[0]?.quantity ?? 0;
}

/** Sayım: bir depodaki adedi belirli değere getirir (ADJUSTMENT). Dönen değer: depodaki yeni adet. */
export async function setWarehouseStock(tx: Tx, key: StockKey, warehouseId: string, target: number, meta: Meta = {}) {
  const inv = await ensureInventory(tx, key);
  await ensureWarehouseStock(tx, inv.id, warehouseId);
  const cur = await tx.$queryRaw<{ quantity: number }[]>`
    SELECT quantity FROM warehouse_stocks WHERE "warehouseId" = ${warehouseId} AND "inventoryId" = ${inv.id} FOR UPDATE`;
  const diff = target - cur[0].quantity;
  if (diff === 0) return target;
  return adjustStock(tx, key, diff, "ADJUSTMENT", { ...meta, warehouseId });
}

/** Depolar arası transfer: kaynaktan TRANSFER_OUT, hedefe TRANSFER_IN; ikisi aynı işlemde. */
export async function transferStock(tx: Tx, key: StockKey, fromId: string, toId: string, qty: number, meta: Meta = {}) {
  if (fromId === toId) throw new StockError("Kaynak ve hedef depo aynı olamaz.", key);
  if (!Number.isInteger(qty) || qty <= 0) throw new StockError("Transfer miktarı pozitif tam sayı olmalı.", key);
  const from = await adjustStock(tx, key, -qty, "TRANSFER_OUT", { ...meta, warehouseId: fromId });
  const to = await adjustStock(tx, key, qty, "TRANSFER_IN", { ...meta, warehouseId: toId });
  return { from, to };
}

export async function setMinStock(tx: Tx, key: StockKey, minStock: number) {
  const inv = await ensureInventory(tx, key);
  await tx.inventory.update({ where: { id: inv.id }, data: { minStock } });
}

/** Ödeme bekleyen sipariş için adet ayırır. Yeterli stok yoksa StockError. */
export async function reserve(tx: Tx, key: StockKey, qty: number) {
  const inv = await ensureInventory(tx, key);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE inventory SET reserved = reserved + ${qty}, "updatedAt" = now()
    WHERE id = ${inv.id} AND quantity - reserved >= ${qty}
    RETURNING id`;
  if (!rows.length) throw new StockError("Yeterli stok yok.", key);
}

/** Ayırmayı bırakır (ödeme başarısız, iptal veya süre doldu). */
export async function release(tx: Tx, key: StockKey, qty: number) {
  const inv = await ensureInventory(tx, key);
  await tx.$executeRaw`UPDATE inventory SET reserved = GREATEST(reserved - ${qty}, 0), "updatedAt" = now() WHERE id = ${inv.id}`;
}

/**
 * Ödeme doğrulandı: ayrılan adet satılabilir toplamdan düşülür (SALE_OUT) ve online depolardan
 * (önce varsayılan depo, sonra en çok stoğu olan) karşılanır.
 */
export async function commitSale(tx: Tx, key: StockKey, qty: number, meta: Meta) {
  const inv = await ensureInventory(tx, key);
  await adoptLegacy(tx, inv.id); // toplam düşülmeden önce: eski satırın adedi varsayılan depoya yazılır
  const rows = await tx.$queryRaw<{ quantity: number }[]>`
    UPDATE inventory SET quantity = quantity - ${qty}, reserved = reserved - ${qty}, "updatedAt" = now()
    WHERE id = ${inv.id} AND reserved >= ${qty} AND quantity >= ${qty}
    RETURNING quantity`;
  if (!rows.length) throw new StockError("Sipariş için ayrılmış stok bulunamadı.", key);
  const sources = await tx.$queryRaw<{ id: string; warehouseId: string; quantity: number }[]>`
    SELECT s.id, s."warehouseId", s.quantity FROM warehouse_stocks s JOIN warehouses w ON w.id = s."warehouseId"
    WHERE s."inventoryId" = ${inv.id} AND w."sellsOnline" AND s.quantity > 0
    ORDER BY w."isDefault" DESC, s.quantity DESC
    FOR UPDATE OF s`;
  let left = qty;
  for (const src of sources) {
    if (left === 0) break;
    const take = Math.min(left, src.quantity);
    const after = await tx.$queryRaw<{ quantity: number }[]>`
      UPDATE warehouse_stocks SET quantity = quantity - ${take}, "updatedAt" = now() WHERE id = ${src.id} RETURNING quantity`;
    await movement(tx, key, "SALE_OUT", -take, after[0].quantity, meta, src.warehouseId);
    left -= take;
  }
  if (left > 0) throw new StockError("Depo stokları satılabilir toplamla uyuşmuyor; satış tamamlanamadı.", key);
  await tx.product.update({ where: { id: key.productId }, data: { soldCount: { increment: qty } } });
}

/** Ödenmiş siparişin iptali / iadesi: stok varsayılan depoya geri eklenir. */
export async function restock(tx: Tx, key: StockKey, qty: number, type: "CANCEL_IN" | "RETURN_IN", meta: Meta) {
  return adjustStock(tx, key, qty, type, meta);
}

export function stockState(available: number, minStock: number) {
  return available <= 0 ? ("out" as const) : available <= Math.max(minStock, 3) ? ("low" as const) : ("in" as const);
}
