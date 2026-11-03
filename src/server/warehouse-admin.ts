import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { adjustStock, StockError, transferStock, type StockKey } from "./inventory";

export type Result = { ok: true; message: string; id?: string } | { ok: false; message: string; errors?: Record<string, string> };

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const warehouseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Depo kodu en az 2 karakter olmalı.")
    .max(20, "Depo kodu en fazla 20 karakter olabilir.")
    .transform((s) => s.toUpperCase())
    .refine((s) => /^[A-Z0-9-]+$/.test(s), "Depo kodu yalnız harf, rakam ve tire içerebilir."),
  name: z.string().trim().min(2, "Depo adı girin.").max(120),
  address: z.string().trim().max(500).optional().transform((s) => s || null),
  sellsOnline: bool,
  isActive: bool,
});

function fieldErrors(e: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const i of e.issues) errors[String(i.path[0])] ??= i.message;
  return errors;
}

export async function createWarehouse(user: StaffUser, raw: Record<string, unknown>): Promise<Result> {
  const p = warehouseSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: "Formdaki hataları düzeltin.", errors: fieldErrors(p.error) };
  if (await prisma.warehouse.findUnique({ where: { code: p.data.code } }))
    return { ok: false, message: "Bu depo kodu kullanılıyor.", errors: { code: "Bu depo kodu kullanılıyor." } };
  const max = await prisma.warehouse.aggregate({ _max: { sortOrder: true } });
  const w = await prisma.warehouse.create({ data: { ...p.data, isActive: true, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await audit(user.id, "warehouse.create", "Warehouse", w.id, undefined, p.data);
  return { ok: true, message: `${w.name} oluşturuldu.`, id: w.id };
}

/**
 * Depo düzenleme. Online satış açılıp kapanınca satılabilir toplam bu deponun adetleri kadar değişir;
 * kapatma, ödeme bekleyen siparişlere ayrılan adedi karşılayamayacaksa reddedilir.
 * Pasife alma yalnız stoğu boş, varsayılan olmayan depoda yapılabilir.
 */
export async function updateWarehouse(user: StaffUser, id: string, raw: Record<string, unknown>): Promise<Result> {
  const p = warehouseSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: "Formdaki hataları düzeltin.", errors: fieldErrors(p.error) };
  const before = await prisma.warehouse.findUnique({ where: { id } });
  if (!before) return { ok: false, message: "Depo bulunamadı." };
  const clash = await prisma.warehouse.findUnique({ where: { code: p.data.code } });
  if (clash && clash.id !== id) return { ok: false, message: "Bu depo kodu kullanılıyor.", errors: { code: "Bu depo kodu kullanılıyor." } };
  const units = (await prisma.warehouseStock.aggregate({ where: { warehouseId: id }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  if (before.isDefault && !p.data.isActive) return { ok: false, message: "Varsayılan depo pasife alınamaz." };
  if (before.isDefault && !p.data.sellsOnline) return { ok: false, message: "Varsayılan depo online satışa kapatılamaz." };
  if (before.isActive && !p.data.isActive && units > 0)
    return { ok: false, message: `Depoda ${units} adet ürün var. Pasife almadan önce stoğu transfer edin.` };
  try {
    await prisma.$transaction(async (tx) => {
      if (before.sellsOnline !== p.data.sellsOnline) {
        const sign = p.data.sellsOnline ? 1 : -1;
        await tx.$executeRaw`
          UPDATE inventory i SET quantity = i.quantity + ${sign} * s.quantity, "updatedAt" = now()
          FROM warehouse_stocks s WHERE s."inventoryId" = i.id AND s."warehouseId" = ${id} AND s.quantity > 0`;
      }
      await tx.warehouse.update({ where: { id }, data: p.data });
    });
  } catch (e) {
    const text = `${String(e)} ${JSON.stringify((e as { meta?: unknown })?.meta ?? {})}`;
    if (/inventory_nonnegative_check|23514|check constraint/i.test(text))
      return { ok: false, message: "Bu depodaki bazı ürünler ödeme bekleyen siparişlere ayrılmış; depo şu an online satışa kapatılamaz." };
    throw e;
  }
  await audit(user.id, "warehouse.update", "Warehouse", id, { code: before.code, name: before.name, sellsOnline: before.sellsOnline, isActive: before.isActive }, p.data);
  return { ok: true, message: `${p.data.name} güncellendi.` };
}

/** Ürün kodu, varyant kodu veya barkoddan envanter anahtarı bulur. */
export async function findStockItem(code: string): Promise<{ key: StockKey; label: string } | null> {
  const c = code.trim();
  if (!c) return null;
  const product = await prisma.product.findFirst({ where: { deletedAt: null, OR: [{ sku: c.toUpperCase() }, { barcode: c }] } });
  if (product) return { key: { productId: product.id }, label: `${product.name} (${product.sku})` };
  const variant = await prisma.productVariant.findFirst({ where: { OR: [{ sku: c.toUpperCase() }, { barcode: c }] } });
  if (variant) return { key: { productId: variant.productId, variantId: variant.id }, label: `${variant.name} (${variant.sku})` };
  return null;
}

const qty = z.coerce
  .number({ invalid_type_error: "Miktar sayı olmalı." })
  .int("Miktar tam sayı olmalı.")
  .positive("Miktar 0'dan büyük olmalı.")
  .max(1_000_000);

export const transferSchema = z.object({
  code: z.string().trim().min(1, "Ürün kodu veya barkod girin."),
  fromId: z.string().min(1, "Kaynak depoyu seçin."),
  toId: z.string().min(1, "Hedef depoyu seçin."),
  quantity: qty,
  note: z.string().trim().max(300).optional(),
});

export async function transfer(user: StaffUser, raw: Record<string, unknown>): Promise<Result> {
  const p = transferSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const item = await findStockItem(p.data.code);
  if (!item) return { ok: false, message: `"${p.data.code}" kodlu ürün bulunamadı.` };
  const [from, to] = await Promise.all([
    prisma.warehouse.findUnique({ where: { id: p.data.fromId } }),
    prisma.warehouse.findUnique({ where: { id: p.data.toId } }),
  ]);
  if (!from || !to) return { ok: false, message: "Depo bulunamadı." };
  const note = p.data.note || `Transfer ${from.code} → ${to.code}`;
  try {
    const r = await prisma.$transaction((tx) => transferStock(tx, item.key, from.id, to.id, p.data.quantity, { userId: user.id, note }));
    await audit(user.id, "warehouse.transfer", "Inventory", item.key.variantId ?? item.key.productId, undefined, {
      code: p.data.code, from: from.code, to: to.code, quantity: p.data.quantity, fromAfter: r.from, toAfter: r.to,
    });
    return { ok: true, message: `${item.label}: ${p.data.quantity} adet ${from.name} → ${to.name}. Kalan ${r.from}, hedefte ${r.to}.` };
  } catch (e) {
    if (e instanceof StockError) return { ok: false, message: e.message };
    throw e;
  }
}

export const ISSUE_KINDS = { ISSUE_OUT: "Mal çıkışı", DAMAGE_OUT: "Hasarlı ürün", WASTE_OUT: "Fire" } as const;

export const issueSchema = z.object({
  code: z.string().trim().min(1, "Ürün kodu veya barkod girin."),
  warehouseId: z.string().min(1, "Depoyu seçin."),
  kind: z.enum(["ISSUE_OUT", "DAMAGE_OUT", "WASTE_OUT"], { errorMap: () => ({ message: "Çıkış türünü seçin." }) }),
  quantity: qty,
  note: z.string().trim().min(3, "Çıkış nedeni / açıklama zorunludur.").max(300),
});

/** Satış dışı stok çıkışı (mal çıkışı, hasar, fire). Açıklama zorunludur; hareket geri alınmaz, gerekirse giriş yapılır. */
export async function issue(user: StaffUser, raw: Record<string, unknown>): Promise<Result> {
  const p = issueSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const item = await findStockItem(p.data.code);
  if (!item) return { ok: false, message: `"${p.data.code}" kodlu ürün bulunamadı.` };
  const label = ISSUE_KINDS[p.data.kind];
  try {
    const after = await prisma.$transaction((tx) =>
      adjustStock(tx, item.key, -p.data.quantity, p.data.kind, { userId: user.id, warehouseId: p.data.warehouseId, note: `${label}: ${p.data.note}` }),
    );
    await audit(user.id, "warehouse.issue", "Inventory", item.key.variantId ?? item.key.productId, undefined, { ...p.data, after });
    return { ok: true, message: `${item.label}: ${p.data.quantity} adet ${label.toLocaleLowerCase("tr-TR")} kaydedildi. Depoda kalan ${after}.` };
  } catch (e) {
    if (e instanceof StockError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Satılabilir toplam ile online depo adetleri toplamı uyuşmayan kalemler (sağlık kontrolü). */
export async function stockMismatches() {
  return prisma.$queryRaw<{ inventoryId: string; quantity: number; online: number }[]>`
    SELECT i.id AS "inventoryId", i.quantity, COALESCE(SUM(s.quantity) FILTER (WHERE w."sellsOnline"), 0)::int AS online
    FROM inventory i
    LEFT JOIN warehouse_stocks s ON s."inventoryId" = i.id
    LEFT JOIN warehouses w ON w.id = s."warehouseId"
    GROUP BY i.id, i.quantity
    HAVING COUNT(s.id) > 0 AND i.quantity <> COALESCE(SUM(s.quantity) FILTER (WHERE w."sellsOnline"), 0)`;
}
