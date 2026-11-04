import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/auth/session";
import { posTotals, refundAmount, settle } from "@/lib/pos-calc";
import { formatTL } from "@/lib/money";
import { adjustStock, ensureInventory, StockError, warehouseQty } from "./inventory";
import { findStockItem } from "./warehouse-admin";

type Tx = Prisma.TransactionClient;
export type LookupResult =
  | { ok: true; productId: string; variantId: string | null; name: string; sku: string; unitPrice: number; vatRate: number; inWarehouse: number; available: number; active: boolean }
  | { ok: false; message: string };

/** Barkod / ürün kodu → ürün, KDV dahil satış fiyatı ve seçilen depodaki adet. */
export async function lookup(code: string, warehouseId: string): Promise<LookupResult> {
  const item = await findStockItem(code);
  if (!item) return { ok: false, message: `"${code}" ile eşleşen ürün yok.` };
  const product = await prisma.product.findUniqueOrThrow({ where: { id: item.key.productId } });
  const variant = item.key.variantId ? await prisma.productVariant.findUnique({ where: { id: item.key.variantId } }) : null;
  const unitPrice = Number(variant?.salePrice ?? variant?.price ?? product.salePrice ?? product.price);
  const { inWarehouse, available } = await prisma.$transaction(async (tx) => {
    const inv = await ensureInventory(tx, item.key);
    const wq = await warehouseQty(tx, inv.id, warehouseId);
    const wh = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    const fresh = await tx.inventory.findUniqueOrThrow({ where: { id: inv.id } });
    // online depoda, ödeme bekleyen sipariş ayırmaları kasadan satılamaz
    return { inWarehouse: wq, available: wh.sellsOnline ? Math.max(0, Math.min(wq, fresh.quantity - fresh.reserved)) : wq };
  });
  return {
    ok: true, productId: product.id, variantId: variant?.id ?? null, name: variant ? `${product.name} · ${variant.name}` : product.name,
    sku: variant?.sku ?? product.sku, unitPrice, vatRate: product.vatRate, inWarehouse, available, active: product.status === "ACTIVE" && !product.deletedAt,
  };
}

const money = z.coerce.number({ invalid_type_error: "Tutar sayı olmalı." }).min(0, "Tutar negatif olamaz.").max(10_000_000);
export const saleSchema = z.object({
  warehouseId: z.string().min(1, "Depo seçin."),
  items: z
    .array(z.object({ productId: z.string().min(1), variantId: z.string().nullable().optional(), quantity: z.coerce.number().int().positive().max(100_000), discount: money.default(0) }))
    .min(1, "Sepet boş."),
  cartDiscount: money.default(0),
  card: money.default(0),
  cashGiven: money.default(0),
  customerEmail: z.string().trim().max(200).optional(),
  documentNo: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

function number(prefix: string) {
  const d = new Date();
  return `${prefix}${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${randomInt(10000, 99999)}`;
}

export type SaleResult = { ok: true; id: string; number: string; grandTotal: number; change: number } | { ok: false; message: string };

/**
 * Satışı tamamlar. Fiyatlar istemciden alınmaz, veritabanından okunur. Tek işlemde: satış kaydı, depodan stok düşümü
 * (online depoda ödeme bekleyen sipariş ayırmalarının altına inilemez → online ile eşzamanlı satış güvenli), tahsilat kaydı.
 */
export async function completeSale(user: StaffUser, raw: unknown): Promise<SaleResult> {
  const p = saleSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const d = p.data;
  const wh = await prisma.warehouse.findUnique({ where: { id: d.warehouseId } });
  if (!wh || !wh.isActive) return { ok: false, message: "Depo bulunamadı veya pasif." };
  const products = await prisma.product.findMany({ where: { id: { in: d.items.map((i) => i.productId) } }, include: { variants: true } });
  type Line = { productId: string; variantId: string | null; quantity: number; discount: number; name: string; sku: string; unitPrice: number; vatRate: number };
  const lines: Line[] = [];
  for (const i of d.items) {
    const pr = products.find((x) => x.id === i.productId);
    if (!pr || pr.deletedAt) return { ok: false, message: "Sepette bulunamayan ürün var." };
    const v = i.variantId ? pr.variants.find((x) => x.id === i.variantId) : null;
    if (i.variantId && !v) return { ok: false, message: "Varyant bulunamadı." };
    lines.push({ ...i, variantId: v?.id ?? null, name: v ? `${pr.name} · ${v.name}` : pr.name, sku: v?.sku ?? pr.sku, unitPrice: Number(v?.salePrice ?? v?.price ?? pr.salePrice ?? pr.price), vatRate: pr.vatRate });
  }
  const t = posTotals(lines, d.cartDiscount);
  if ("error" in t) return { ok: false, message: t.error ?? "Hatalı tutar." };
  const pay = settle(t.grandTotal, d.card, d.cashGiven);
  if ("error" in pay) return { ok: false, message: pay.error ?? "Ödeme hatalı." };
  const customer = d.customerEmail ? await prisma.user.findFirst({ where: { email: d.customerEmail.toLowerCase(), type: "CUSTOMER", deletedAt: null } }) : null;
  if (d.customerEmail && !customer) return { ok: false, message: "Bu e-postayla kayıtlı müşteri bulunamadı (boş bırakılabilir)." };
  try {
    const sale = await prisma.$transaction(async (tx: Tx) => {
      const s = await tx.storeSale.create({
        data: {
          number: number("KS"), warehouseId: wh.id, customerId: customer?.id ?? null, customerName: customer ? `${customer.firstName} ${customer.lastName}` : null,
          subtotal: t.subtotal, discountTotal: t.discountTotal, grandTotal: t.grandTotal, vatTotal: t.vatTotal,
          documentNo: d.documentNo || null, note: d.note || null, cashierId: user.id,
          items: {
            create: lines.map((l, i) => ({
              productId: l.productId, variantId: l.variantId, name: l.name, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice,
              discount: t.lines[i].discount, vatRate: l.vatRate, lineTotal: t.lines[i].lineTotal,
            })),
          },
          payments: {
            create: [
              ...(pay.card > 0 ? [{ method: "CARD" as const, amount: pay.card, note: "Ayrı POS cihazında çekildi (kayıt)" }] : []),
              ...(pay.cash > 0 ? [{ method: "CASH" as const, amount: pay.cash, note: pay.change > 0 ? `Para üstü ${formatTL(pay.change)}` : null }] : []),
            ],
          },
        },
      });
      for (const l of lines) {
        await adjustStock(tx, { productId: l.productId, variantId: l.variantId }, -l.quantity, "SALE_OUT", {
          userId: user.id, warehouseId: wh.id, storeSaleId: s.id, note: `Mağaza satışı ${s.number}`,
        });
        await tx.product.update({ where: { id: l.productId }, data: { soldCount: { increment: l.quantity } } });
      }
      await tx.auditLog.create({ data: { userId: user.id, action: "pos.sale", entity: "StoreSale", entityId: s.id, after: { number: s.number, total: t.grandTotal, card: pay.card, cash: pay.cash } } });
      return s;
    });
    return { ok: true, id: sale.id, number: sale.number, grandTotal: t.grandTotal, change: pay.change };
  } catch (e) {
    if (e instanceof StockError) return { ok: false, message: `Stok yetersiz: ${e.message}` };
    throw e;
  }
}

/** İptal: henüz iade yapılmamış satışın tamamı geri alınır; stok depoya döner, tahsilatlar ters kayıtla kapanır. */
export async function cancelSale(user: StaffUser, id: string, reason: string) {
  const r = reason.trim();
  if (r.length < 3) return { ok: false as const, message: "İptal nedenini yazın." };
  return prisma.$transaction(async (tx: Tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM store_sales WHERE id = ${id} FOR UPDATE`;
    if (!locked.length) return { ok: false as const, message: "Satış bulunamadı." };
    const s = await tx.storeSale.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true, returns: true } });
    if (s.status !== "COMPLETED") return { ok: false as const, message: "Satış zaten iptal edilmiş." };
    if (s.returns.length) return { ok: false as const, message: "İade yapılmış satış iptal edilemez; kalan ürünleri iade olarak alın." };
    for (const i of s.items) {
      await adjustStock(tx, { productId: i.productId, variantId: i.variantId }, i.quantity, "CANCEL_IN", { userId: user.id, warehouseId: s.warehouseId, storeSaleId: s.id, note: `Satış iptali ${s.number}` });
      await tx.product.update({ where: { id: i.productId }, data: { soldCount: { decrement: i.quantity } } });
    }
    for (const pm of s.payments) await tx.storePayment.create({ data: { storeSaleId: s.id, method: pm.method, amount: -Number(pm.amount), note: "İptal — geri ödeme" } });
    await tx.storeSale.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancelReason: r.slice(0, 500), refundedTotal: s.grandTotal } });
    await tx.auditLog.create({ data: { userId: user.id, action: "pos.cancel", entity: "StoreSale", entityId: s.id, after: { reason: r } } });
    return { ok: true as const, message: `${s.number} iptal edildi; stok depoya döndü, ${formatTL(s.grandTotal)} geri ödeme kaydedildi.` };
  });
}

/**
 * İade: satır başına adet; "stoğa al" seçilmezse ürün hasarlı sayılır (giriş + hasar çıkışı ile iz bırakır, satılabilir stok artmaz).
 * Geri ödeme seçilen yöntemle ters tahsilat olarak kaydedilir.
 */
export async function returnItems(user: StaffUser, saleId: string, lines: { itemId: string; quantity: number; restock: boolean }[], reason: string, method: "CASH" | "CARD") {
  const r = reason.trim();
  if (r.length < 3) return { ok: false as const, message: "İade nedenini yazın." };
  const wanted = lines.filter((l) => l.quantity > 0);
  if (!wanted.length) return { ok: false as const, message: "İade edilecek adet girin." };
  try {
    return await prisma.$transaction(async (tx: Tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM store_sales WHERE id = ${saleId} FOR UPDATE`;
      if (!locked.length) return { ok: false as const, message: "Satış bulunamadı." };
      const s = await tx.storeSale.findUniqueOrThrow({ where: { id: saleId }, include: { items: { include: { returnItems: true } } } });
      if (s.status !== "COMPLETED") return { ok: false as const, message: "İptal edilmiş satışta iade yapılamaz." };
      const ret = await tx.storeReturn.create({ data: { number: number("KI"), storeSaleId: s.id, reason: r.slice(0, 500), total: 0, cashierId: user.id } });
      let total = 0;
      for (const l of wanted) {
        const it = s.items.find((x) => x.id === l.itemId);
        if (!it) throw new StockError("Satışta olmayan satır.", { productId: "" });
        const soFar = it.returnItems.reduce((a, x) => a + Number(x.amount), 0);
        const amount = refundAmount(Number(it.lineTotal), it.quantity, it.returnedQty, soFar, l.quantity);
        if (amount === null) throw new StockError(`${it.name}: en fazla ${it.quantity - it.returnedQty} adet iade edilebilir.`, { productId: it.productId });
        const upd = await tx.$executeRaw`UPDATE store_sale_items SET "returnedQty" = "returnedQty" + ${l.quantity} WHERE id = ${it.id} AND "returnedQty" + ${l.quantity} <= quantity`;
        if (upd !== 1) throw new StockError(`${it.name}: iade adedi satılanı aşıyor.`, { productId: it.productId });
        await tx.storeReturnItem.create({ data: { storeReturnId: ret.id, storeSaleItemId: it.id, quantity: l.quantity, amount, restocked: l.restock } });
        const key = { productId: it.productId, variantId: it.variantId };
        const meta = { userId: user.id, warehouseId: s.warehouseId, storeSaleId: s.id };
        await adjustStock(tx, key, l.quantity, "RETURN_IN", { ...meta, note: `Mağaza iadesi ${ret.number}` });
        if (!l.restock) await adjustStock(tx, key, -l.quantity, "DAMAGE_OUT", { ...meta, note: `Hasarlı iade ${ret.number}: ${r.slice(0, 200)}` });
        total += amount;
      }
      total = Math.round(total * 100) / 100;
      await tx.storeReturn.update({ where: { id: ret.id }, data: { total } });
      await tx.storePayment.create({ data: { storeSaleId: s.id, method, amount: -total, note: `İade ${ret.number}` } });
      await tx.storeSale.update({ where: { id: s.id }, data: { refundedTotal: { increment: total } } });
      await tx.auditLog.create({ data: { userId: user.id, action: "pos.return", entity: "StoreSale", entityId: s.id, after: { return: ret.number, total, lines: wanted } } });
      return { ok: true as const, message: `${ret.number}: ${formatTL(total)} iade kaydedildi (${method === "CASH" ? "nakit" : "karta"}).` };
    });
  } catch (e) {
    if (e instanceof StockError) return { ok: false as const, message: e.message };
    throw e;
  }
}
