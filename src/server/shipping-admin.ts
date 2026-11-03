import "server-only";
import { z } from "zod";
import type { ShipmentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { formatTL, parseMoney } from "@/lib/money";
import { sendEmail, trackingLink } from "./email";

export type Result = { ok: true; message: string } | { ok: false; message: string };
const money = (v: FormDataEntryValue | null) => parseMoney(String(v ?? ""));

// ---------------------------------------------------------------- profiller ve tarifeler

/** Profil tarifesini günceller. Standart profilde kademeler (min–max kg/desi → ücret) bütün olarak değiştirilir. */
export async function updateProfile(user: StaffUser, fd: FormData): Promise<Result> {
  const id = String(fd.get("id"));
  const p = await prisma.shippingProfile.findUnique({ where: { id }, include: { rates: true } });
  if (!p) return { ok: false, message: "Profil bulunamadı." };
  const basePrice = money(fd.get("basePrice"));
  const unitPrice = money(fd.get("unitPrice")) ?? 0;
  const baseIncludes = Number(String(fd.get("baseIncludes") ?? "0").replace(",", "."));
  const tMin = Number(fd.get("transitDaysMin"));
  const tMax = Number(fd.get("transitDaysMax"));
  if (basePrice === null || basePrice < 0) return { ok: false, message: "Taban ücret geçerli bir tutar olmalı." };
  if (unitPrice < 0 || !(baseIncludes >= 0)) return { ok: false, message: "Birim ücret ve tabana dahil miktar negatif olamaz." };
  if (!Number.isInteger(tMin) || !Number.isInteger(tMax) || tMin < 1 || tMax < tMin || tMax > 30) return { ok: false, message: "Teslim süresi 1–30 iş günü ve en az ≤ en çok olmalı." };

  let rates: { minWeight: number; maxWeight: number; price: number }[] | null = null;
  if (p.packing === "COMBINED") {
    rates = [];
    const mins = fd.getAll("rateMin"), maxs = fd.getAll("rateMax"), prices = fd.getAll("ratePrice");
    for (let i = 0; i < mins.length; i++) {
      if (String(mins[i]).trim() === "" && String(maxs[i]).trim() === "") continue;
      const min = Number(String(mins[i]).replace(",", ".")), max = Number(String(maxs[i]).replace(",", ".")), price = money(prices[i]);
      if (!(min >= 0) || !(max > min) || price === null || price < 0) return { ok: false, message: `Kademe ${i + 1}: en az < en çok ve ücret ≥ 0 olmalı.` };
      rates.push({ minWeight: min, maxWeight: max, price });
    }
    rates.sort((a, b) => a.minWeight - b.minWeight);
    if (!rates.length) return { ok: false, message: "Standart profilde en az bir kademe olmalı." };
    if (rates[0].minWeight !== 0) return { ok: false, message: "İlk kademe 0'dan başlamalı." };
    for (let i = 1; i < rates.length; i++)
      if (rates[i].minWeight !== rates[i - 1].maxWeight) return { ok: false, message: `Kademeler arasında boşluk veya çakışma var (${rates[i - 1].maxWeight} → ${rates[i].minWeight}).` };
  }
  await prisma.$transaction(async (tx) => {
    await tx.shippingProfile.update({
      where: { id },
      data: {
        basePrice, unitPrice, baseIncludes, transitDaysMin: tMin, transitDaysMax: tMax,
        freeShippingEligible: fd.get("freeShippingEligible") === "on",
        deliveryNote: String(fd.get("deliveryNote") ?? "").trim().slice(0, 300) || null,
      },
    });
    if (rates) {
      await tx.shippingRate.deleteMany({ where: { profileId: id } });
      await tx.shippingRate.createMany({ data: rates.map((r) => ({ ...r, profileId: id })) });
    }
  });
  await audit(user.id, "shipping.profile", "ShippingProfile", id,
    { basePrice: p.basePrice, unitPrice: p.unitPrice, rates: p.rates.map((r) => [r.minWeight, r.maxWeight, r.price]) },
    { basePrice, unitPrice, rates });
  return { ok: true, message: `${p.name} profili güncellendi.` };
}

export async function updateFreeThreshold(user: StaffUser, raw: string): Promise<Result> {
  const v = raw.trim() === "" || raw.trim() === "0" ? 0 : parseMoney(raw);
  if (v === null || v < 0) return { ok: false, message: "Ücretsiz kargo sınırı geçerli bir tutar olmalı (kapatmak için 0)." };
  await prisma.siteSetting.upsert({ where: { key: "shipping.freeThreshold" }, update: { value: v }, create: { key: "shipping.freeThreshold", value: v } });
  await audit(user.id, "shipping.threshold", "SiteSetting", "shipping.freeThreshold", undefined, { value: v });
  return { ok: true, message: v ? `Ücretsiz kargo sınırı ${formatTL(v)} olarak kaydedildi.` : "Sepet tutarına göre ücretsiz kargo kapatıldı." };
}

// ---------------------------------------------------------------- kargo firmaları ve teslimat yöntemleri

const companySchema = z.object({
  name: z.string().trim().min(2, "Firma adı girin.").max(60),
  trackingUrlTemplate: z
    .string().trim().max(300)
    .refine((v) => v === "" || (/^https:\/\//.test(v) && v.includes("{no}")), "Takip adresi https:// ile başlamalı ve {no} içermeli.")
    .optional(),
  agreementNote: z.string().trim().max(200).optional(),
});

export async function saveCompany(user: StaffUser, fd: FormData): Promise<Result> {
  const id = String(fd.get("id") || "") || null;
  const parsed = companySchema.safeParse({ name: fd.get("name"), trackingUrlTemplate: fd.get("trackingUrlTemplate") ?? "", agreementNote: fd.get("agreementNote") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  const dupe = await prisma.cargoCompany.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, NOT: id ? { id } : undefined } });
  if (dupe) return { ok: false, message: "Bu adla bir kargo firması zaten var." };
  const data = { name: d.name, trackingUrlTemplate: d.trackingUrlTemplate || null, agreementNote: d.agreementNote || null, isActive: fd.get("isActive") === "on" };
  const saved = id ? await prisma.cargoCompany.update({ where: { id }, data }) : await prisma.cargoCompany.create({ data });
  await audit(user.id, id ? "cargo.update" : "cargo.create", "CargoCompany", saved.id, undefined, data);
  return { ok: true, message: `${saved.name} kaydedildi.` };
}

export async function saveMethod(user: StaffUser, fd: FormData): Promise<Result> {
  const id = String(fd.get("id") || "") || null;
  const name = String(fd.get("name") ?? "").trim();
  const code = String(fd.get("code") ?? "").trim().toUpperCase();
  const extraFee = money(fd.get("extraFee")) ?? 0;
  if (name.length < 2) return { ok: false, message: "Yöntem adı girin." };
  if (!/^[A-Z0-9_]{2,20}$/.test(code)) return { ok: false, message: "Kod 2–20 karakter; büyük harf, rakam ve _ olmalı." };
  if (extraFee < 0) return { ok: false, message: "Ek ücret negatif olamaz." };
  const companyId = String(fd.get("cargoCompanyId") || "") || null;
  const dupe = await prisma.shippingMethod.findUnique({ where: { code } });
  if (dupe && dupe.id !== id) return { ok: false, message: "Bu kod başka bir yöntemde kullanılıyor." };
  const data = {
    name, code, extraFee, cargoCompanyId: companyId,
    description: String(fd.get("description") ?? "").trim().slice(0, 300) || null,
    isActive: fd.get("isActive") === "on",
  };
  const saved = id ? await prisma.shippingMethod.update({ where: { id }, data }) : await prisma.shippingMethod.create({ data });
  if (!saved.isActive && (await prisma.shippingMethod.count({ where: { isActive: true } })) === 0) {
    await prisma.shippingMethod.update({ where: { id: saved.id }, data: { isActive: true } });
    return { ok: false, message: "En az bir teslimat yöntemi aktif kalmalı; yöntem aktif bırakıldı." };
  }
  await audit(user.id, id ? "method.update" : "method.create", "ShippingMethod", saved.id, undefined, data);
  return { ok: true, message: `${saved.name} kaydedildi.` };
}

// ---------------------------------------------------------------- gönderiler (manuel kargo yönetimi)

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  PREPARING: "Hazırlanıyor",
  SHIPPED: "Kargoya verildi",
  IN_TRANSIT: "Yolda",
  OUT_FOR_DELIVERY: "Dağıtımda",
  DELIVERED: "Teslim edildi",
  RETURNED: "İade / teslim edilemedi",
};

const NEXT: Record<ShipmentStatus, ShipmentStatus[]> = {
  PREPARING: ["SHIPPED"],
  SHIPPED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "RETURNED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RETURNED"],
  DELIVERED: [],
  RETURNED: [],
};
export const allowedShipmentTransitions = (s: ShipmentStatus) => NEXT[s];

/**
 * Gönderi durumunu ilerletir. Kargoya verirken firma ve takip numarası zorunludur.
 * Sipariş durumu gönderilere göre güncellenir; müşteriye bildirim e-postası hazırlanır (şu an kayda yazılır).
 */
export async function updateShipment(user: StaffUser, fd: FormData): Promise<Result> {
  const id = String(fd.get("shipmentId"));
  const to = String(fd.get("status")) as ShipmentStatus;
  const note = String(fd.get("note") ?? "").trim().slice(0, 300) || null;
  const s = await prisma.shipment.findUnique({ where: { id }, include: { order: true, cargoCompany: true } });
  if (!s) return { ok: false, message: "Gönderi bulunamadı." };
  if (!["PAID", "PREPARING", "SHIPPED"].includes(s.order.status) && to !== "RETURNED")
    return { ok: false, message: `Sipariş durumu (${s.order.status}) kargo işlemine uygun değil.` };
  if (!NEXT[s.status].includes(to)) return { ok: false, message: `"${SHIPMENT_LABEL[s.status]}" durumundan "${SHIPMENT_LABEL[to] ?? to}" durumuna geçilemez.` };

  let companyId = s.cargoCompanyId;
  let tracking = s.trackingNumber;
  if (to === "SHIPPED") {
    companyId = String(fd.get("cargoCompanyId") || "") || null;
    tracking = String(fd.get("trackingNumber") ?? "").trim().toUpperCase();
    if (!companyId) return { ok: false, message: "Kargo firmasını seçin." };
    if (!/^[A-Z0-9-]{6,40}$/.test(tracking)) return { ok: false, message: "Takip numarası 6–40 karakter; harf, rakam ve tire olmalı." };
    const company = await prisma.cargoCompany.findFirst({ where: { id: companyId, isActive: true } });
    if (!company) return { ok: false, message: "Kargo firması bulunamadı veya pasif." };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({
      where: { id },
      data: {
        status: to,
        cargoCompanyId: companyId,
        trackingNumber: tracking,
        ...(to === "SHIPPED" ? { shippedAt: now } : {}),
        ...(to === "DELIVERED" ? { deliveredAt: now } : {}),
      },
      include: { cargoCompany: true },
    });
    await tx.shipmentEvent.create({ data: { shipmentId: id, status: to, note, changedById: user.id } });

    // sipariş durumunu gönderilere göre güncelle
    const all = await tx.shipment.findMany({ where: { orderId: s.orderId } });
    let orderTo: "SHIPPED" | "DELIVERED" | null = null;
    if (all.every((x) => x.status === "DELIVERED")) orderTo = "DELIVERED";
    else if (to === "SHIPPED" && ["PAID", "PREPARING"].includes(s.order.status)) orderTo = "SHIPPED";
    if (orderTo && orderTo !== s.order.status) {
      await tx.order.update({
        where: { id: s.orderId },
        data: { status: orderTo, ...(orderTo === "SHIPPED" ? { shippedAt: now } : { deliveredAt: now }) },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: s.orderId, fromStatus: s.order.status, toStatus: orderTo, changedById: user.id, note: "Gönderi durumuna göre otomatik" },
      });
    }
    return updated;
  });

  if (to === "SHIPPED" || to === "DELIVERED") {
    const link = trackingLink(result.cargoCompany?.trackingUrlTemplate, result.trackingNumber);
    const subject = to === "SHIPPED" ? `Siparişiniz kargoya verildi — ${s.order.orderNumber}` : `Siparişiniz teslim edildi — ${s.order.orderNumber}`;
    const body =
      to === "SHIPPED"
        ? `Merhaba ${s.order.customerName},\n\n${s.order.orderNumber} numaralı siparişinizin "${s.description}" paketi kargoya verildi.\n` +
          `Kargo firması: ${result.cargoCompany?.name}\nTakip numarası: ${result.trackingNumber}\n` +
          (link ? `Takip: ${link}\n` : "") +
          `\nSipariş durumunu sitemizdeki "Sipariş takip" sayfasından da izleyebilirsiniz.\n\nÖner Yapı Market`
        : `Merhaba ${s.order.customerName},\n\n${s.order.orderNumber} numaralı siparişinizin "${s.description}" paketi teslim edildi.\n\nÖner Yapı Market`;
    await sendEmail({ to: s.order.customerEmail, subject, body, template: to === "SHIPPED" ? "shipment.shipped" : "shipment.delivered", orderId: s.orderId });
  }
  await audit(user.id, "shipment.status", "Shipment", id, { status: s.status }, { status: to, trackingNumber: tracking });
  return { ok: true, message: `Gönderi durumu: ${SHIPMENT_LABEL[to]}.` };
}
