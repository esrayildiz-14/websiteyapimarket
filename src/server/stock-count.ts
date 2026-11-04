import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { adjustStock, ensureInventory, StockError, warehouseQty } from "./inventory";
import { findStockItem } from "./warehouse-admin";

export type Result = { ok: true; message: string; id?: string } | { ok: false; message: string };
export type ScanResult =
  | { ok: true; message: string; sku: string; name: string; counted: number; price: number | null }
  | { ok: false; message: string };
type Tx = Prisma.TransactionClient;

export const COUNT_STATUS_LABEL: Record<string, string> = { OPEN: "Sayım sürüyor", SUBMITTED: "Onay bekliyor", APPROVED: "Onaylandı", CANCELLED: "İptal edildi" };

async function lockCount(tx: Tx, id: string) {
  const r = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stock_counts WHERE id = ${id} FOR UPDATE`;
  return r.length ? tx.stockCount.findUniqueOrThrow({ where: { id }, include: { warehouse: true, lines: true } }) : null;
}

export async function startCount(user: StaffUser, warehouseId: string, note: string): Promise<Result> {
  const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!wh || !wh.isActive) return { ok: false, message: "Depo bulunamadı veya pasif." };
  const active = await prisma.stockCount.findFirst({ where: { warehouseId, status: { in: ["OPEN", "SUBMITTED"] } } });
  if (active) return { ok: false, message: `${wh.name} için devam eden sayım var: ${active.number}.` };
  const d = new Date();
  const number = `SY${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}-${randomInt(10000, 99999)}`;
  try {
    const c = await prisma.stockCount.create({ data: { number, warehouseId, note: note.trim().slice(0, 500) || null, createdById: user.id } });
    await audit(user.id, "stockcount.start", "StockCount", c.id, undefined, { number, warehouse: wh.code });
    return { ok: true, message: `${number} başlatıldı. Ürünleri okutun.`, id: c.id };
  } catch (e) {
    if (String(e).includes("stock_counts_one_active_per_warehouse") || String(e).includes("23505"))
      return { ok: false, message: `${wh.name} için devam eden bir sayım var.` };
    throw e;
  }
}

const scanSchema = z.object({
  code: z.string().trim().min(1, "Barkod veya ürün kodu okutun.").max(64),
  quantity: z.coerce.number({ invalid_type_error: "Adet sayı olmalı." }).int("Adet tam sayı olmalı.").min(0, "Adet negatif olamaz.").max(1_000_000),
  mode: z.enum(["add", "set"]),
});

/**
 * Okutma: "add" kipinde her okutma sayılan adedi artırır (varsayılan 1), "set" kipinde sayılan adet girilen değer olur.
 * Ürün ilk okutulduğunda o anki depo adedi "sistem adedi" olarak saklanır.
 */
export async function scan(user: StaffUser, countId: string, raw: Record<string, unknown>): Promise<ScanResult> {
  const p = scanSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const item = await findStockItem(p.data.code);
  if (!item) return { ok: false, message: `"${p.data.code}" ile eşleşen ürün yok.` };
  if (p.data.mode === "add" && p.data.quantity === 0) return { ok: false, message: "Eklenecek adet 0 olamaz." };
  return prisma.$transaction(async (tx): Promise<ScanResult> => {
    const c = await lockCount(tx, countId);
    if (!c) return { ok: false, message: "Sayım bulunamadı." };
    if (c.status !== "OPEN") return { ok: false, message: `${COUNT_STATUS_LABEL[c.status]} durumundaki sayıma okutma yapılamaz.` };
    const inv = await ensureInventory(tx, item.key);
    const existing = c.lines.find((l) => l.inventoryId === inv.id);
    const counted = p.data.mode === "set" ? p.data.quantity : (existing?.countedQty ?? 0) + p.data.quantity;
    if (existing) await tx.stockCountLine.update({ where: { id: existing.id }, data: { countedQty: counted } });
    else {
      const systemQty = await warehouseQty(tx, inv.id, c.warehouseId);
      const product = await tx.product.findUniqueOrThrow({ where: { id: item.key.productId } });
      const variant = item.key.variantId ? await tx.productVariant.findUnique({ where: { id: item.key.variantId } }) : null;
      await tx.stockCountLine.create({
        data: {
          stockCountId: c.id, inventoryId: inv.id, productId: product.id, sku: variant?.sku ?? product.sku,
          name: variant ? `${product.name} · ${variant.name}` : product.name, systemQty, countedQty: counted,
        },
      });
    }
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.key.productId } });
    const price = product.salePrice ? Number(product.salePrice) : Number(product.price);
    void user;
    return { ok: true, message: `${item.label}: sayılan ${counted}`, sku: item.label, name: product.name, counted, price };
  });
}

export async function removeLine(user: StaffUser, countId: string, lineId: string): Promise<Result> {
  return prisma.$transaction(async (tx): Promise<Result> => {
    const c = await lockCount(tx, countId);
    if (!c || c.status !== "OPEN") return { ok: false, message: "Yalnız süren sayımda satır silinebilir." };
    const l = c.lines.find((x) => x.id === lineId);
    if (!l) return { ok: false, message: "Satır bulunamadı." };
    await tx.stockCountLine.delete({ where: { id: lineId } });
    await tx.auditLog.create({ data: { userId: user.id, action: "stockcount.line.remove", entity: "StockCount", entityId: c.id, before: { sku: l.sku, counted: l.countedQty } } });
    return { ok: true, message: `${l.name} sayımdan çıkarıldı.` };
  });
}

/** Onaya gönder. Tam sayımda, sayılmayan ve depoda stoğu olan ürünler onayda 0'a çekilir. */
export async function submitCount(user: StaffUser, countId: string, fullCount: boolean): Promise<Result> {
  return prisma.$transaction(async (tx): Promise<Result> => {
    const c = await lockCount(tx, countId);
    if (!c || c.status !== "OPEN") return { ok: false, message: "Yalnız süren sayım onaya gönderilebilir." };
    if (!c.lines.length && !fullCount) return { ok: false, message: "Henüz ürün okutulmadı." };
    await tx.stockCount.update({ where: { id: c.id }, data: { status: "SUBMITTED", fullCount, submittedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: user.id, action: "stockcount.submit", entity: "StockCount", entityId: c.id, after: { fullCount, lines: c.lines.length } } });
    return { ok: true, message: `${c.number} onaya gönderildi.` };
  });
}

export async function reopenCount(user: StaffUser, countId: string): Promise<Result> {
  const r = await prisma.stockCount.updateMany({ where: { id: countId, status: "SUBMITTED" }, data: { status: "OPEN", submittedAt: null } });
  if (!r.count) return { ok: false, message: "Yalnız onay bekleyen sayım yeniden açılabilir." };
  await audit(user.id, "stockcount.reopen", "StockCount", countId);
  return { ok: true, message: "Sayım yeniden açıldı." };
}

export async function cancelCount(user: StaffUser, countId: string): Promise<Result> {
  const r = await prisma.stockCount.updateMany({ where: { id: countId, status: { in: ["OPEN", "SUBMITTED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  if (!r.count) return { ok: false, message: "Bu sayım iptal edilemez." };
  await audit(user.id, "stockcount.cancel", "StockCount", countId);
  return { ok: true, message: "Sayım iptal edildi; stok değişmedi." };
}

/** Uncounted: tam sayımda depoda stoğu olup okutulmamış kalemler. */
async function uncounted(tx: Tx | typeof prisma, c: { warehouseId: string; lines: { inventoryId: string }[] }) {
  const ids = c.lines.map((l) => l.inventoryId);
  return tx.$queryRaw<{ inventoryId: string; productId: string; sku: string; name: string; quantity: number }[]>`
    SELECT s."inventoryId", COALESCE(i."productId", v."productId") AS "productId", COALESCE(v.sku, p.sku) AS sku,
           COALESCE(p.name || ' · ' || v.name, p.name) AS name, s.quantity
    FROM warehouse_stocks s JOIN inventory i ON i.id = s."inventoryId"
    LEFT JOIN product_variants v ON v.id = i."variantId"
    JOIN products p ON p.id = COALESCE(i."productId", v."productId")
    WHERE s."warehouseId" = ${c.warehouseId} AND s.quantity > 0 AND NOT (s."inventoryId" = ANY(${ids}::text[]))
    ORDER BY p.name`;
}

export async function countReport(countId: string) {
  const c = await prisma.stockCount.findUnique({ where: { id: countId }, include: { warehouse: true, lines: { orderBy: { scannedAt: "desc" } } } });
  if (!c) return null;
  const costs = await prisma.product.findMany({ where: { id: { in: c.lines.map((l) => l.productId) } }, select: { id: true, avgCost: true, purchasePrice: true } });
  const cost = (pid: string) => {
    const x = costs.find((y) => y.id === pid);
    return x?.avgCost != null ? Number(x.avgCost) : x?.purchasePrice != null ? Number(x.purchasePrice) : null;
  };
  const lines = c.lines.map((l) => ({ ...l, diff: l.countedQty - l.systemQty, unitCost: cost(l.productId) }));
  const missing = c.status === "OPEN" || c.status === "SUBMITTED" ? await uncounted(prisma, c) : [];
  const diffs = lines.filter((l) => l.diff !== 0);
  const valued = diffs.filter((l) => l.unitCost !== null);
  return {
    count: c,
    lines,
    missing,
    summary: {
      scanned: lines.length,
      withDiff: diffs.length,
      plus: diffs.filter((l) => l.diff > 0).reduce((s, l) => s + l.diff, 0),
      minus: diffs.filter((l) => l.diff < 0).reduce((s, l) => s + l.diff, 0),
      value: Math.round(valued.reduce((s, l) => s + l.diff * (l.unitCost ?? 0), 0) * 100) / 100,
      unvalued: diffs.length - valued.length,
    },
  };
}

/**
 * Onay: her satırda yeni adet = güncel adet + (sayılan − ilk okutmadaki sistem adedi). Böylece sayım sırasında
 * olan satış / mal kabul hareketleri kaybolmaz. Farklar ADJUSTMENT hareketi olarak yazılır (kaynak: bu sayım).
 * Dört göz: sayımı başlatan kişi onaylayamaz (Super Admin hariç). Hepsi tek işlemde: biri olmazsa hiçbiri olmaz.
 */
export async function approveCount(user: StaffUser, countId: string): Promise<Result> {
  try {
    return await prisma.$transaction(async (tx): Promise<Result> => {
      const c = await lockCount(tx, countId);
      if (!c) return { ok: false, message: "Sayım bulunamadı." };
      if (c.status !== "SUBMITTED") return { ok: false, message: "Yalnız onay bekleyen sayım onaylanabilir." };
      if (c.createdById === user.id && !user.permissions.has("*")) return { ok: false, message: "Kendi başlattığınız sayımı onaylayamazsınız; başka bir yetkili onaylamalı." };
      let changed = 0;
      const meta = (sku: string) => ({ userId: user.id, warehouseId: c.warehouseId, stockCountId: c.id, note: `Sayım ${c.number} · ${sku}` });
      for (const l of c.lines) {
        const current = await warehouseQty(tx, l.inventoryId, c.warehouseId);
        const target = Math.max(0, current + (l.countedQty - l.systemQty));
        if (target !== current) {
          const inv = await tx.inventory.findUniqueOrThrow({ where: { id: l.inventoryId } });
          await adjustStock(tx, { productId: l.productId, variantId: inv.variantId }, target - current, "ADJUSTMENT", meta(l.sku));
          changed++;
        }
      }
      if (c.fullCount) {
        for (const m of await uncounted(tx, c)) {
          const inv = await tx.inventory.findUniqueOrThrow({ where: { id: m.inventoryId } });
          await tx.stockCountLine.create({
            data: { stockCountId: c.id, inventoryId: m.inventoryId, productId: m.productId, sku: m.sku, name: m.name, systemQty: m.quantity, countedQty: 0 },
          });
          await adjustStock(tx, { productId: m.productId, variantId: inv.variantId }, -m.quantity, "ADJUSTMENT", meta(m.sku));
          changed++;
        }
      }
      await tx.stockCount.update({ where: { id: c.id }, data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: user.id, action: "stockcount.approve", entity: "StockCount", entityId: c.id, after: { changed, fullCount: c.fullCount } } });
      return { ok: true, message: `${c.number} onaylandı: ${changed} üründe stok düzeltildi.` };
    });
  } catch (e) {
    if (e instanceof StockError) return { ok: false, message: `Onaylanamadı: ${e.message} Ödeme bekleyen siparişler tamamlanınca tekrar deneyin.` };
    throw e;
  }
}
