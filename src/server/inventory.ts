import "server-only";
import type { MovementType, Prisma } from "@/generated/prisma/client";

/**
 * Envanter işlemleri. Bütün stok değişiklikleri buradan geçer ve her biri:
 *  - tek bir SQL UPDATE ile koşullu yapılır (yarış durumunda stok eksiye düşmez),
 *  - inventory_movements tablosuna hareket kaydı yazar.
 * Fonksiyonlar bir işlem (transaction) içinde çağrılmalıdır.
 *
 * Kurallar
 *  - available = quantity − reserved
 *  - reserve: ödeme bekleyen sipariş için adet ayırır (available yeterliyse)
 *  - commitSale: ödeme doğrulanınca ayrılan adedi stoktan düşer
 *  - release: ödeme başarısız / süre doldu → ayırmayı geri bırakır
 */
type Tx = Prisma.TransactionClient;
export type StockKey = { productId: string; variantId?: string | null };
type Meta = { userId?: string | null; orderId?: string | null; note?: string | null };

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

async function movement(tx: Tx, key: StockKey, type: MovementType, quantity: number, stockAfter: number, meta: Meta) {
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
    },
  });
}

/** Stok girişi (+) veya çıkışı (−). Sonuç, ayrılmış adedin altına inemez. */
export async function adjustStock(tx: Tx, key: StockKey, delta: number, type: MovementType, meta: Meta = {}) {
  if (!Number.isInteger(delta) || delta === 0) throw new StockError("Geçersiz stok miktarı.", key);
  const inv = await ensureInventory(tx, key);
  const rows = await tx.$queryRaw<{ quantity: number }[]>`
    UPDATE inventory SET quantity = quantity + ${delta}, "updatedAt" = now()
    WHERE id = ${inv.id} AND quantity + ${delta} >= reserved AND quantity + ${delta} >= 0
    RETURNING quantity`;
  if (!rows.length) throw new StockError("Stok negatif olamaz veya ödeme bekleyen siparişlere ayrılan adedin altına inemez.", key);
  await movement(tx, key, type, delta, rows[0].quantity, meta);
  return rows[0].quantity;
}

/** Sayım sonucu stoğu belirli bir değere getirir (ADJUSTMENT hareketi). */
export async function setStock(tx: Tx, key: StockKey, target: number, meta: Meta = {}) {
  const inv = await ensureInventory(tx, key);
  const locked = await tx.$queryRaw<{ quantity: number }[]>`SELECT quantity FROM inventory WHERE id = ${inv.id} FOR UPDATE`;
  const diff = target - locked[0].quantity;
  if (diff === 0) return target;
  return adjustStock(tx, key, diff, "ADJUSTMENT", meta);
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

/** Ödeme doğrulandı: ayrılan adet stoktan düşülür (SALE_OUT). */
export async function commitSale(tx: Tx, key: StockKey, qty: number, meta: Meta) {
  const inv = await ensureInventory(tx, key);
  const rows = await tx.$queryRaw<{ quantity: number }[]>`
    UPDATE inventory SET quantity = quantity - ${qty}, reserved = reserved - ${qty}, "updatedAt" = now()
    WHERE id = ${inv.id} AND reserved >= ${qty} AND quantity >= ${qty}
    RETURNING quantity`;
  if (!rows.length) throw new StockError("Sipariş için ayrılmış stok bulunamadı.", key);
  await movement(tx, key, "SALE_OUT", -qty, rows[0].quantity, meta);
  await tx.product.update({ where: { id: key.productId }, data: { soldCount: { increment: qty } } });
}

/** Ödenmiş siparişin iptali / iadesi: stok geri eklenir. */
export async function restock(tx: Tx, key: StockKey, qty: number, type: "CANCEL_IN" | "RETURN_IN", meta: Meta) {
  return adjustStock(tx, key, qty, type, meta);
}

export function stockState(available: number, minStock: number) {
  return available <= 0 ? ("out" as const) : available <= Math.max(minStock, 3) ? ("low" as const) : ("in" as const);
}
