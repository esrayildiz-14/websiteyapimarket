import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { parseMoney } from "@/lib/money";

export type Result = { ok: true; message: string } | { ok: false; message: string };
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Kampanya (otomatik indirim): ürün, kategori, marka veya tüm ürünler için yüzde / tutar indirimi. */
export async function saveDiscount(user: StaffUser, fd: FormData): Promise<Result> {
  const id = String(fd.get("id") || "") || null;
  const name = String(fd.get("name") ?? "").trim();
  const type = fd.get("type") === "FIXED" ? "FIXED" : "PERCENT";
  const value = parseMoney(String(fd.get("value") ?? ""));
  const target = String(fd.get("target") ?? "ALL") as "ALL" | "PRODUCT" | "CATEGORY" | "BRAND";
  const startsAt = date(fd.get("startsAt"));
  const endsAt = date(fd.get("endsAt"));
  if (name.length < 3) return { ok: false, message: "Kampanya adı girin." };
  if (value === null || value <= 0 || (type === "PERCENT" && value >= 100)) return { ok: false, message: "İndirim değeri 0'dan büyük olmalı (yüzde ise 100'den küçük)." };
  if (!["ALL", "PRODUCT", "CATEGORY", "BRAND"].includes(target)) return { ok: false, message: "Kapsam seçin." };
  if (!startsAt || !endsAt || endsAt <= startsAt) return { ok: false, message: "Başlangıç ve bitiş tarihi girin; bitiş başlangıçtan sonra olmalı." };
  let targetId: string | null = null;
  if (target === "PRODUCT") {
    const sku = String(fd.get("productSku") ?? "").trim().toUpperCase();
    const p = await prisma.product.findUnique({ where: { sku } });
    if (!p) return { ok: false, message: `"${sku}" kodlu ürün bulunamadı.` };
    targetId = p.id;
  } else if (target === "CATEGORY") {
    targetId = String(fd.get("categoryId") || "") || null;
    if (!targetId || !(await prisma.category.findUnique({ where: { id: targetId } }))) return { ok: false, message: "Kategori seçin." };
  } else if (target === "BRAND") {
    targetId = String(fd.get("brandId") || "") || null;
    if (!targetId || !(await prisma.brand.findUnique({ where: { id: targetId } }))) return { ok: false, message: "Marka seçin." };
  }
  const data = { name, type, value, target, targetId, startsAt, endsAt, isActive: fd.get("isActive") === "on" } as const;
  const saved = id ? await prisma.discount.update({ where: { id }, data }) : await prisma.discount.create({ data });
  await audit(user.id, id ? "discount.update" : "discount.create", "Discount", saved.id, undefined, data);
  return { ok: true, message: `"${name}" kampanyası kaydedildi.` };
}

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,30}$/, "Kupon kodu 4–30 karakter; harf, rakam, - ve _ olmalı."),
  type: z.enum(["PERCENT", "FIXED"]),
});

export async function saveCoupon(user: StaffUser, fd: FormData): Promise<Result> {
  const id = String(fd.get("id") || "") || null;
  const p = couponSchema.safeParse({ code: fd.get("code"), type: fd.get("type") });
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const value = parseMoney(String(fd.get("value") ?? ""));
  if (value === null || value <= 0 || (p.data.type === "PERCENT" && value >= 100)) return { ok: false, message: "İndirim değeri 0'dan büyük olmalı (yüzde ise 100'den küçük)." };
  const opt = (k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : parseMoney(String(fd.get(k))));
  const optInt = (k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : Math.max(0, Math.floor(Number(fd.get(k)))));
  const startsAt = date(fd.get("startsAt"));
  const endsAt = date(fd.get("endsAt"));
  if (startsAt === undefined || endsAt === undefined) return { ok: false, message: "Tarih biçimi geçersiz." };
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, message: "Bitiş başlangıçtan sonra olmalı." };
  const dupe = await prisma.coupon.findUnique({ where: { code: p.data.code } });
  if (dupe && dupe.id !== id) return { ok: false, message: "Bu kupon kodu zaten var." };
  const data = {
    code: p.data.code, type: p.data.type, value, minOrderTotal: opt("minOrderTotal"), maxDiscount: opt("maxDiscount"),
    usageLimit: optInt("usageLimit"), perUserLimit: optInt("perUserLimit"), startsAt, endsAt, isActive: fd.get("isActive") === "on",
  };
  const saved = id ? await prisma.coupon.update({ where: { id }, data }) : await prisma.coupon.create({ data });
  await audit(user.id, id ? "coupon.update" : "coupon.create", "Coupon", saved.id, undefined, data);
  return { ok: true, message: `${saved.code} kuponu kaydedildi.` };
}
