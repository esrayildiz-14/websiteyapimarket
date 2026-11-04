import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { parseMoney } from "@/lib/money";
import { taxNumberProblem } from "@/lib/purchase-calc";

export type Result = { ok: true; message: string; id?: string } | { ok: false; message: string; errors?: Record<string, string> };

const opt = (max: number) => z.string().trim().max(max).optional().transform((s) => s || null);

export const supplierSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Tedarikçi kodu en az 2 karakter olmalı.")
    .max(30)
    .transform((s) => s.toUpperCase())
    .refine((s) => /^[A-Z0-9-]+$/.test(s), "Kod yalnız harf, rakam ve tire içerebilir."),
  name: z.string().trim().min(2, "Firma adını girin.").max(200),
  contactName: opt(120),
  phone: opt(30).refine((s) => !s || /^[0-9 +()-]{7,30}$/.test(s), "Telefon numarası geçersiz."),
  email: opt(200).refine((s) => !s || z.string().email().safeParse(s).success, "E-posta adresi geçersiz."),
  address: opt(500),
  taxOffice: opt(120),
  taxNumber: opt(20).refine((s) => !s || !taxNumberProblem(s), (s) => ({ message: taxNumberProblem(s ?? "") ?? "" })),
  productGroups: opt(500),
  paymentTerms: opt(200),
  avgLeadDays: z.preprocess((v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number({ invalid_type_error: "Teslim süresi sayı olmalı." }).int("Teslim süresi tam gün olmalı.").min(0).max(365).nullable()),
  status: z.enum(["ACTIVE", "PASSIVE", "BLOCKED"], { errorMap: () => ({ message: "Durum seçin." }) }),
  notes: opt(2000),
});

function fieldErrors(e: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const i of e.issues) errors[String(i.path[0])] ??= i.message;
  return errors;
}

export async function saveSupplier(user: StaffUser, raw: Record<string, unknown>, id?: string): Promise<Result> {
  const p = supplierSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: "Formdaki hataları düzeltin.", errors: fieldErrors(p.error) };
  const d = { ...p.data, taxNumber: p.data.taxNumber?.replace(/\s/g, "") ?? null };
  const clash = await prisma.supplier.findUnique({ where: { code: d.code } });
  if (clash && clash.id !== id) return { ok: false, message: "Bu tedarikçi kodu kullanılıyor.", errors: { code: "Bu tedarikçi kodu kullanılıyor." } };
  if (d.taxNumber) {
    const sameTax = await prisma.supplier.findFirst({ where: { taxNumber: d.taxNumber, ...(id ? { NOT: { id } } : {}) } });
    if (sameTax) return { ok: false, message: `Bu vergi numarası ${sameTax.name} (${sameTax.code}) kartında kayıtlı.`, errors: { taxNumber: "Bu vergi numarası başka bir tedarikçide kayıtlı." } };
  }
  if (id) {
    const before = await prisma.supplier.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "Tedarikçi bulunamadı." };
    await prisma.supplier.update({ where: { id }, data: d });
    await audit(user.id, "supplier.update", "Supplier", id, before, d);
    return { ok: true, message: `${d.name} güncellendi.`, id };
  }
  const s = await prisma.supplier.create({ data: d });
  await audit(user.id, "supplier.create", "Supplier", s.id, undefined, d);
  return { ok: true, message: `${d.name} kaydedildi.`, id: s.id };
}

const intOrNull = (label: string, min: number) =>
  z.preprocess((v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number({ invalid_type_error: `${label} sayı olmalı.` }).int(`${label} tam sayı olmalı.`).min(min, `${label} en az ${min} olmalı.`).max(1_000_000).nullable());

export const supplierProductSchema = z.object({
  code: z.string().trim().min(1, "Ürün kodu veya barkod girin."),
  supplierSku: opt(60),
  purchasePrice: z.string().trim().min(1, "Alış fiyatını girin."),
  discountPct: z.string().trim().optional(),
  minOrderQty: intOrNull("En az sipariş adedi", 1),
  leadDays: intOrNull("Tedarik süresi", 0),
  supplierStock: intOrNull("Tedarikçi stoğu", 0),
});

/** Tedarikçiye ürün bağlar veya alış koşullarını günceller (tedarikçi + ürün başına tek kayıt). */
export async function saveSupplierProduct(user: StaffUser, supplierId: string, raw: Record<string, unknown>): Promise<Result> {
  const p = supplierProductSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const price = parseMoney(p.data.purchasePrice);
  if (price === null || price < 0) return { ok: false, message: "Alış fiyatı geçerli bir tutar olmalı." };
  const disc = p.data.discountPct ? parseMoney(p.data.discountPct) : 0;
  if (disc === null || disc < 0 || disc > 100) return { ok: false, message: "İskonto 0 ile 100 arasında olmalı." };
  const c = p.data.code;
  const product = await prisma.product.findFirst({ where: { deletedAt: null, OR: [{ sku: c.toUpperCase() }, { barcode: c }] } });
  if (!product) return { ok: false, message: `"${c}" kodlu ürün bulunamadı.` };
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return { ok: false, message: "Tedarikçi bulunamadı." };
  const data = {
    supplierSku: p.data.supplierSku, purchasePrice: price, discountPct: disc,
    minOrderQty: p.data.minOrderQty ?? 1, leadDays: p.data.leadDays, supplierStock: p.data.supplierStock,
  };
  const before = await prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId: product.id } } });
  const sp = await prisma.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId, productId: product.id } },
    update: data,
    create: { ...data, supplierId, productId: product.id },
  });
  await audit(user.id, before ? "supplier.product.update" : "supplier.product.create", "SupplierProduct", sp.id, before ?? undefined, { ...data, sku: product.sku });
  return { ok: true, message: `${product.name}: alış koşulları ${before ? "güncellendi" : "eklendi"}.` };
}

export async function removeSupplierProduct(user: StaffUser, id: string): Promise<Result> {
  const sp = await prisma.supplierProduct.findUnique({ where: { id }, include: { product: true } });
  if (!sp) return { ok: false, message: "Kayıt bulunamadı." };
  await prisma.supplierProduct.delete({ where: { id } });
  await audit(user.id, "supplier.product.delete", "SupplierProduct", id, { sku: sp.product.sku, purchasePrice: sp.purchasePrice }, undefined);
  return { ok: true, message: `${sp.product.name} tedarikçiden kaldırıldı.` };
}

/**
 * Tedarikçi performansı — yalnız kayıtlı satın alma ve mal kabul verilerinden.
 *  - teslim süresi: siparişin tedarikçiye iletildiği an → tam teslim (son mal kabul)
 *  - zamanında teslim: beklenen tarihi olan ve tam teslim edilmiş siparişlerde, tam teslim ≤ beklenen tarih (gün sonu)
 *  - eksik teslim: kısmi teslimde kalan veya iptal edilmiş kısmi siparişlerdeki eksik adet
 *  - alış fiyatı değişimi: ürün bazında ilk ve son mal kabul birim maliyeti
 */
export async function supplierPerformance(supplierId: string) {
  const orders = await prisma.purchaseOrder.findMany({
    where: { supplierId, status: { not: "DRAFT" } },
    include: { items: true, receipts: { include: { items: { include: { orderItem: true } } }, orderBy: { createdAt: "asc" } } },
  });
  let receivedValue = 0, orderedUnits = 0, receivedUnits = 0;
  const lead: number[] = [];
  let onTimeBase = 0, onTime = 0;
  const priceSeries = new Map<string, { name: string; first: number; last: number }>();
  for (const o of orders) {
    if (o.status === "CANCELLED" && o.receipts.length === 0) continue;
    for (const i of o.items) {
      orderedUnits += i.quantity;
      receivedUnits += i.receivedQty;
    }
    for (const r of o.receipts) {
      for (const ri of r.items) {
        receivedValue += ri.quantity * Number(ri.unitCost);
        const k = ri.orderItem.productId;
        const cost = Number(ri.unitCost);
        const cur = priceSeries.get(k);
        if (!cur) priceSeries.set(k, { name: ri.orderItem.productName, first: cost, last: cost });
        else cur.last = cost;
      }
    }
    if (o.status === "RECEIVED" && o.sentAt && o.receivedAt) {
      lead.push((o.receivedAt.getTime() - o.sentAt.getTime()) / 86_400_000);
      if (o.expectedAt) {
        onTimeBase++;
        const due = new Date(o.expectedAt);
        due.setHours(23, 59, 59, 999);
        if (o.receivedAt.getTime() <= due.getTime()) onTime++;
      }
    }
  }
  const openShort = orders.filter((o) => o.status === "PARTIAL").reduce((s, o) => s + o.items.reduce((a, i) => a + (i.quantity - i.receivedQty), 0), 0);
  return {
    orderCount: orders.filter((o) => o.status !== "CANCELLED").length,
    receivedValue: Math.round(receivedValue * 100) / 100,
    avgLeadDays: lead.length ? Math.round((lead.reduce((a, b) => a + b, 0) / lead.length) * 10) / 10 : null,
    onTimeRate: onTimeBase ? Math.round((onTime / onTimeBase) * 100) : null,
    onTimeBase,
    fillRate: orderedUnits ? Math.round((receivedUnits / orderedUnits) * 100) : null,
    openShortUnits: openShort,
    priceChanges: [...priceSeries.values()]
      .filter((p) => p.first !== p.last)
      .map((p) => ({ ...p, pct: Math.round(((p.last - p.first) / p.first) * 1000) / 10 })),
  };
}
