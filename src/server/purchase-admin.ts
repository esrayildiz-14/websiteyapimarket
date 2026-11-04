import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { parseMoney } from "@/lib/money";
import { canDo, PURCHASE_STATUS_LABEL, purchaseLine, purchaseTotals, unitCost, weightedAverageCost } from "@/lib/purchase-calc";
import { adjustStock, StockError } from "./inventory";

export type Result = { ok: true; message: string; id?: string } | { ok: false; message: string; errors?: Record<string, string> };
type Tx = Prisma.TransactionClient;

async function nextNumber(tx: Tx, prefix: "SA" | "MK") {
  const d = new Date();
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  for (;;) {
    const n = `${prefix}${ym}-${randomInt(10000, 99999)}`;
    const exists = prefix === "SA" ? await tx.purchaseOrder.findUnique({ where: { number: n } }) : await tx.goodsReceipt.findUnique({ where: { number: n } });
    if (!exists) return n;
  }
}

/** Siparişi kilitler (eş zamanlı işlemler sırayla yürür) ve getirir. */
async function lockOrder(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) return null;
  return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true, supplier: true, warehouse: true } });
}

async function recalc(tx: Tx, id: string) {
  const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
  const t = purchaseTotals(items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice), discountPct: Number(i.discountPct), vatRate: i.vatRate })));
  await tx.purchaseOrder.update({ where: { id }, data: t });
  return t;
}

const createSchema = z.object({
  supplierId: z.string().min(1, "Tedarikçi seçin."),
  warehouseId: z.string().min(1, "Teslim alınacak depoyu seçin."),
  expectedAt: z.string().trim().optional().transform((s) => (s ? new Date(s) : null)).refine((d) => d === null || !Number.isNaN(d.getTime()), "Beklenen tarih geçersiz."),
  note: z.string().trim().max(1000).optional().transform((s) => s || null),
});

export async function createPurchaseOrder(user: StaffUser, raw: Record<string, unknown>): Promise<Result> {
  const p = createSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const [supplier, wh] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: p.data.supplierId } }),
    prisma.warehouse.findUnique({ where: { id: p.data.warehouseId } }),
  ]);
  if (!supplier) return { ok: false, message: "Tedarikçi bulunamadı." };
  if (supplier.status !== "ACTIVE") return { ok: false, message: `${supplier.name} ${supplier.status === "BLOCKED" ? "engelli" : "pasif"}; sipariş açılamaz.` };
  if (!wh || !wh.isActive) return { ok: false, message: "Depo bulunamadı veya pasif." };
  const po = await prisma.$transaction(async (tx) =>
    tx.purchaseOrder.create({
      data: { number: await nextNumber(tx, "SA"), supplierId: supplier.id, warehouseId: wh.id, expectedAt: p.data.expectedAt, note: p.data.note, createdById: user.id },
    }),
  );
  await audit(user.id, "purchase.create", "PurchaseOrder", po.id, undefined, { number: po.number, supplier: supplier.code, warehouse: wh.code });
  return { ok: true, message: `${po.number} taslak olarak oluşturuldu. Ürünleri ekleyin.`, id: po.id };
}

const itemSchema = z.object({
  code: z.string().trim().min(1, "Ürün kodu veya barkod girin."),
  quantity: z.coerce.number({ invalid_type_error: "Adet sayı olmalı." }).int("Adet tam sayı olmalı.").positive("Adet 0'dan büyük olmalı.").max(1_000_000),
  unitPrice: z.string().trim().optional(),
  discountPct: z.string().trim().optional(),
});

/** Taslağa ürün ekler. Fiyat boşsa tedarikçinin kayıtlı alış fiyatı ve iskontosu kullanılır. Aynı ürün ikinci kez eklenirse adet artar. */
export async function addPurchaseItem(user: StaffUser, poId: string, raw: Record<string, unknown>): Promise<Result> {
  const p = itemSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const c = p.data.code;
  const product = await prisma.product.findFirst({ where: { deletedAt: null, OR: [{ sku: c.toUpperCase() }, { barcode: c }] } });
  if (!product) return { ok: false, message: `"${c}" kodlu ürün bulunamadı.` };
  return prisma.$transaction(async (tx): Promise<Result> => {
    const po = await lockOrder(tx, poId);
    if (!po) return { ok: false, message: "Sipariş bulunamadı." };
    if (!canDo("edit", po.status)) return { ok: false, message: `${PURCHASE_STATUS_LABEL[po.status]} durumundaki sipariş değiştirilemez.` };
    const sp = await tx.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId: po.supplierId, productId: product.id } } });
    const price = p.data.unitPrice ? parseMoney(p.data.unitPrice) : sp ? Number(sp.purchasePrice) : null;
    if (price === null || price < 0) return { ok: false, message: sp ? "Birim fiyat geçersiz." : "Bu ürün için tedarikçide kayıtlı fiyat yok; birim alış fiyatını girin." };
    const disc = p.data.discountPct ? parseMoney(p.data.discountPct) : sp ? Number(sp.discountPct) : 0;
    if (disc === null || disc < 0 || disc > 100) return { ok: false, message: "İskonto 0 ile 100 arasında olmalı." };
    const existing = po.items.find((i) => i.productId === product.id);
    const qty = (existing?.quantity ?? 0) + p.data.quantity;
    const line = purchaseLine({ quantity: qty, unitPrice: price, discountPct: disc, vatRate: product.vatRate });
    const data = { quantity: qty, unitPrice: price, discountPct: disc, vatRate: product.vatRate, lineNet: line.net, lineVat: line.vat };
    if (existing) await tx.purchaseOrderItem.update({ where: { id: existing.id }, data });
    else
      await tx.purchaseOrderItem.create({
        data: { ...data, purchaseOrderId: po.id, productId: product.id, productName: product.name, sku: product.sku, supplierSku: sp?.supplierSku ?? null },
      });
    await recalc(tx, po.id);
    const warn = sp && qty < sp.minOrderQty ? ` Uyarı: tedarikçinin en az sipariş adedi ${sp.minOrderQty}.` : "";
    await audit(user.id, "purchase.item", "PurchaseOrder", po.id, undefined, { sku: product.sku, quantity: qty, unitPrice: price, discountPct: disc });
    return { ok: true, message: `${product.name}: ${qty} adet.${warn}` };
  });
}

export async function removePurchaseItem(user: StaffUser, poId: string, itemId: string): Promise<Result> {
  return prisma.$transaction(async (tx): Promise<Result> => {
    const po = await lockOrder(tx, poId);
    if (!po) return { ok: false, message: "Sipariş bulunamadı." };
    if (!canDo("edit", po.status)) return { ok: false, message: "Bu sipariş değiştirilemez." };
    const item = po.items.find((i) => i.id === itemId);
    if (!item) return { ok: false, message: "Satır bulunamadı." };
    await tx.purchaseOrderItem.delete({ where: { id: itemId } });
    await recalc(tx, po.id);
    await audit(user.id, "purchase.item.remove", "PurchaseOrder", po.id, { sku: item.sku, quantity: item.quantity }, undefined);
    return { ok: true, message: `${item.productName} siparişten çıkarıldı.` };
  });
}

async function transition(
  user: StaffUser, poId: string, action: "submit" | "backToDraft" | "approve" | "cancel",
  apply: (po: NonNullable<Awaited<ReturnType<typeof lockOrder>>>, tx: Tx) => Promise<Result | Prisma.PurchaseOrderUpdateInput>,
): Promise<Result> {
  const r = await prisma.$transaction(async (tx): Promise<Result> => {
    const po = await lockOrder(tx, poId);
    if (!po) return { ok: false, message: "Sipariş bulunamadı." };
    if (!canDo(action, po.status)) return { ok: false, message: `${PURCHASE_STATUS_LABEL[po.status]} durumundaki siparişte bu işlem yapılamaz.` };
    const out = await apply(po, tx);
    if ("ok" in out) return out as Result;
    const updated = await tx.purchaseOrder.update({ where: { id: po.id }, data: out });
    await tx.auditLog.create({
      data: { userId: user.id, action: `purchase.${action}`, entity: "PurchaseOrder", entityId: po.id, before: { status: po.status }, after: { status: updated.status } },
    });
    return { ok: true, message: `${po.number}: ${PURCHASE_STATUS_LABEL[updated.status]}.` };
  });
  return r;
}

export const submitPurchase = (user: StaffUser, id: string) =>
  transition(user, id, "submit", async (po) => (po.items.length ? { status: "PENDING_APPROVAL" } : { ok: false, message: "Siparişte ürün yok." }));

export const backToDraft = (user: StaffUser, id: string) => transition(user, id, "backToDraft", async () => ({ status: "DRAFT" }));

/**
 * Onay = tedarikçiye iletildi olarak işaretleme. Dört göz kuralı: siparişi oluşturan kişi kendi siparişini onaylayamaz
 * (Super Admin hariç). Sistem tedarikçiye e-posta göndermez; sipariş belgesi ekrandan yazdırılıp iletilir.
 */
export const approvePurchase = (user: StaffUser, id: string) =>
  transition(user, id, "approve", async (po) => {
    if (po.createdById === user.id && !user.permissions.has("*"))
      return { ok: false, message: "Kendi oluşturduğunuz siparişi onaylayamazsınız; başka bir yetkili onaylamalı." };
    if (po.supplier.status !== "ACTIVE") return { ok: false, message: "Tedarikçi aktif değil." };
    const now = new Date();
    return { status: "SENT", approvedById: user.id, approvedAt: now, sentAt: now };
  });

export const cancelPurchase = (user: StaffUser, id: string, reason: string) =>
  transition(user, id, "cancel", async () => {
    const r = reason.trim();
    if (r.length < 3) return { ok: false, message: "İptal nedenini yazın." };
    return { status: "CANCELLED", cancelledAt: new Date(), cancelReason: r.slice(0, 500) };
  });

const receiptSchema = z.object({
  documentType: z.enum(["IRSALIYE", "FATURA", "IRSALIYELI_FATURA"], { errorMap: () => ({ message: "Belge türünü seçin." }) }),
  documentNo: z.string().trim().min(1, "İrsaliye / fatura numarasını girin.").max(60),
  documentDate: z.string().trim().min(1, "Belge tarihini girin.").transform((s) => new Date(s)).refine((d) => !Number.isNaN(d.getTime()), "Belge tarihi geçersiz."),
  note: z.string().trim().max(500).optional().transform((s) => s || null),
});

/**
 * Mal kabul: satır başına teslim alınan adet girilir. Tek işlemde:
 *  - sipariş kilitlenir; her satırda kabul edilen + yeni ≤ sipariş edilen (veritabanı kısıtı da korur),
 *  - siparişin deposuna PURCHASE_IN stok hareketi (kaynak: bu mal kabul),
 *  - ürünün ağırlıklı ortalama maliyeti ve tedarikçideki son alış fiyatı güncellenir,
 *  - sipariş "kısmi" veya "tam teslim" olur.
 */
export async function receiveGoods(user: StaffUser, poId: string, raw: Record<string, unknown>, quantities: Record<string, number>): Promise<Result> {
  const p = receiptSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const lines = Object.entries(quantities).filter(([, q]) => q !== 0);
  if (lines.some(([, q]) => !Number.isInteger(q) || q < 0)) return { ok: false, message: "Teslim alınan adetler 0 veya pozitif tam sayı olmalı." };
  if (!lines.length) return { ok: false, message: "En az bir satırda teslim alınan adedi girin." };
  if (p.data.documentDate.getTime() > Date.now() + 86_400_000) return { ok: false, message: "Belge tarihi ileri bir tarih olamaz." };
  try {
    return await prisma.$transaction(async (tx): Promise<Result> => {
      const po = await lockOrder(tx, poId);
      if (!po) return { ok: false, message: "Sipariş bulunamadı." };
      if (!canDo("receive", po.status)) return { ok: false, message: `${PURCHASE_STATUS_LABEL[po.status]} durumundaki siparişe mal kabul yapılamaz.` };
      const dup = await tx.goodsReceipt.findFirst({ where: { purchaseOrderId: po.id, documentNo: p.data.documentNo } });
      if (dup) return { ok: false, message: `${p.data.documentNo} numaralı belge bu siparişte zaten işlendi (${dup.number}).` };
      for (const [itemId, q] of lines) {
        const it = po.items.find((i) => i.id === itemId);
        if (!it) return { ok: false, message: "Siparişte olmayan satır." };
        if (it.receivedQty + q > it.quantity)
          return { ok: false, message: `${it.productName}: sipariş edilen ${it.quantity}, daha önce kabul edilen ${it.receivedQty}; en fazla ${it.quantity - it.receivedQty} adet kabul edilebilir.` };
      }
      const receipt = await tx.goodsReceipt.create({
        data: { number: await nextNumber(tx, "MK"), purchaseOrderId: po.id, warehouseId: po.warehouseId, ...p.data, createdById: user.id },
      });
      const now = new Date();
      for (const [itemId, q] of lines) {
        const it = po.items.find((i) => i.id === itemId)!;
        const cost = unitCost(Number(it.unitPrice), Number(it.discountPct));
        const upd = await tx.$executeRaw`
          UPDATE purchase_order_items SET "receivedQty" = "receivedQty" + ${q} WHERE id = ${it.id} AND "receivedQty" + ${q} <= quantity`;
        if (upd !== 1) throw new StockError("Kabul edilen adet sipariş edileni aşıyor.", { productId: it.productId });
        await tx.goodsReceiptItem.create({ data: { goodsReceiptId: receipt.id, purchaseOrderItemId: it.id, quantity: q, unitCost: cost } });
        // ağırlıklı ortalama maliyet: tüm depolardaki eldeki adet üzerinden (ürün satırı kilitli)
        const prod = (await tx.$queryRaw<{ avgCost: string | null }[]>`SELECT "avgCost"::text FROM products WHERE id = ${it.productId} FOR UPDATE`)[0];
        const onHand = (await tx.$queryRaw<{ n: number }[]>`
          SELECT COALESCE(SUM(s.quantity), 0)::int AS n FROM warehouse_stocks s JOIN inventory i ON i.id = s."inventoryId" WHERE i."productId" = ${it.productId}`)[0].n;
        const avg = weightedAverageCost(onHand, prod.avgCost === null ? null : Number(prod.avgCost), q, cost);
        await adjustStock(tx, { productId: it.productId }, q, "PURCHASE_IN", {
          userId: user.id, warehouseId: po.warehouseId, goodsReceiptId: receipt.id, note: `Mal kabul ${receipt.number} · ${po.number} · ${p.data.documentNo}`,
        });
        await tx.product.update({ where: { id: it.productId }, data: { avgCost: avg } });
        await tx.supplierProduct.updateMany({
          where: { supplierId: po.supplierId, productId: it.productId },
          data: { lastPurchaseAt: now, lastPurchasePrice: cost },
        });
      }
      const after = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const full = after.every((i) => i.receivedQty === i.quantity);
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: full ? "RECEIVED" : "PARTIAL", ...(full ? { receivedAt: now } : {}) } });
      const total = lines.reduce((s, [, q]) => s + q, 0);
      await tx.auditLog.create({
        data: {
          userId: user.id, action: "purchase.receive", entity: "PurchaseOrder", entityId: po.id,
          after: { receipt: receipt.number, documentNo: p.data.documentNo, lines: Object.fromEntries(lines), status: full ? "RECEIVED" : "PARTIAL" },
        },
      });
      return { ok: true, message: `${receipt.number}: ${total} adet ${po.warehouse.name} deposuna girildi. Sipariş ${full ? "tam teslim edildi" : "kısmi teslim"}.`, id: receipt.id };
    });
  } catch (e) {
    if (e instanceof StockError) return { ok: false, message: e.message };
    throw e;
  }
}
