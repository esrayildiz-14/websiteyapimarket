import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { parseMoney } from "@/lib/money";
import { bulkNewPrice, type BulkPriceInput } from "@/lib/price-rules";
export { bulkPriceSchema, type BulkPriceInput } from "@/lib/price-rules";
import { adjustStock, setMinStock, setStock, setWarehouseStock, StockError } from "./inventory";

export type Result = { ok: true; message: string } | { ok: false; message: string; errors?: Record<string, string> };

// ---------------------------------------------------------------- fiyat

/** Tek ürünün satış ve indirimli fiyatını günceller; değişiklik fiyat geçmişine yazılır. */
export async function updatePrice(user: StaffUser, productId: string, priceRaw: string, saleRaw: string): Promise<Result> {
  const price = parseMoney(priceRaw);
  const salePrice = saleRaw.trim() === "" ? null : parseMoney(saleRaw);
  if (price === null || price <= 0) return { ok: false, message: "Satış fiyatı 0'dan büyük geçerli bir tutar olmalı." };
  if (saleRaw.trim() !== "" && (salePrice === null || salePrice <= 0)) return { ok: false, message: "İndirimli fiyat geçerli bir tutar olmalı." };
  if (salePrice !== null && salePrice >= price) return { ok: false, message: "İndirimli fiyat satış fiyatından düşük olmalı." };
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (!p || p.deletedAt) return { ok: false, message: "Ürün bulunamadı." };
  if (Number(p.price) === price && (p.salePrice === null ? null : Number(p.salePrice)) === salePrice) return { ok: true, message: "Fiyat değişmedi." };
  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { price, salePrice } }),
    prisma.priceHistory.create({ data: { productId, price, salePrice, changedById: user.id } }),
  ]);
  await audit(user.id, "price.update", "Product", productId, { price: p.price, salePrice: p.salePrice }, { price, salePrice });
  return { ok: true, message: `${p.name}: fiyat güncellendi.` };
}

export async function bulkUpdatePrices(user: StaffUser, input: BulkPriceInput, dryRun: boolean) {
  const where = {
    deletedAt: null,
    ...(input.scope === "category" && input.scopeId ? { OR: [{ categoryId: input.scopeId }, { category: { parentId: input.scopeId } }] } : {}),
    ...(input.scope === "brand" && input.scopeId ? { brandId: input.scopeId } : {}),
  };
  const products = await prisma.product.findMany({ where, select: { id: true, name: true, price: true, salePrice: true } });
  const changes = products
    .map((p) => {
      const cur = { price: Number(p.price), salePrice: p.salePrice === null ? null : Number(p.salePrice) };
      const next = bulkNewPrice(cur, input);
      return next && (next.price !== cur.price || next.salePrice !== cur.salePrice) ? { id: p.id, name: p.name, cur, next } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (dryRun) return { matched: products.length, changes };
  for (let i = 0; i < changes.length; i += 200) {
    const chunk = changes.slice(i, i + 200);
    await prisma.$transaction(
      chunk.flatMap((c) => [
        prisma.product.update({ where: { id: c.id }, data: { price: c.next.price, salePrice: c.next.salePrice } }),
        prisma.priceHistory.create({ data: { productId: c.id, price: c.next.price, salePrice: c.next.salePrice, changedById: user.id } }),
      ]),
    );
  }
  await audit(user.id, "price.bulk", "Product", null, undefined, { ...input, changed: changes.length });
  return { matched: products.length, changes };
}

// ---------------------------------------------------------------- stok

export const stockEntrySchema = z.object({
  sku: z.string().trim().min(1, "Ürün kodu girin.").transform((s) => s.toUpperCase()),
  mode: z.enum(["in", "out", "count"]),
  quantity: z.coerce.number({ invalid_type_error: "Miktar sayı olmalı." }).int("Miktar tam sayı olmalı.").min(0, "Miktar negatif olamaz.").max(1_000_000),
  note: z.string().trim().max(300).optional(),
  warehouseId: z.string().trim().optional().transform((s) => s || undefined),
});

/** Stok girişi / çıkışı / sayım. Varyant kodu girilirse varyant stoğu değişir. */
export async function stockEntry(user: StaffUser, raw: Record<string, unknown>): Promise<Result> {
  const parsed = stockEntrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { sku, mode, quantity, note, warehouseId } = parsed.data;
  if (mode !== "count" && quantity === 0) return { ok: false, message: "Giriş veya çıkış miktarı 0 olamaz." };

  const product = await prisma.product.findUnique({ where: { sku } });
  const variant = product ? null : await prisma.productVariant.findUnique({ where: { sku } });
  if (!product && !variant) return { ok: false, message: `"${sku}" kodlu ürün veya varyant bulunamadı.` };
  const key = product ? { productId: product.id } : { productId: variant!.productId, variantId: variant!.id };
  const label = product ? product.name : variant!.name;
  const meta = { userId: user.id, note: note || (mode === "count" ? "Sayım" : mode === "in" ? "Stok girişi" : "Stok çıkışı") };
  try {
    const after = await prisma.$transaction((tx) =>
      mode === "count"
        ? warehouseId ? setWarehouseStock(tx, key, warehouseId, quantity, meta) : setStock(tx, key, quantity, meta)
        : adjustStock(tx, key, mode === "in" ? quantity : -quantity, mode === "in" ? "PURCHASE_IN" : "ADJUSTMENT", { ...meta, warehouseId }),
    );
    await audit(user.id, "stock." + mode, "Inventory", key.variantId ?? key.productId, undefined, { sku, quantity, after, warehouseId });
    return { ok: true, message: warehouseId ? `${label}: depodaki yeni stok ${after}.` : `${label}: yeni stok ${after}.` };
  } catch (e) {
    if (e instanceof StockError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function updateMinStock(user: StaffUser, productId: string, minStock: number): Promise<Result> {
  if (!Number.isInteger(minStock) || minStock < 0) return { ok: false, message: "Minimum stok 0 veya daha büyük tam sayı olmalı." };
  await prisma.$transaction((tx) => setMinStock(tx, { productId }, minStock));
  await audit(user.id, "stock.min", "Inventory", productId, undefined, { minStock });
  return { ok: true, message: "Minimum stok güncellendi." };
}
