import "server-only";
import { prisma } from "@/lib/prisma";
import { calculateShipping, type CartLine, type ProfileCode, type ProfileTariff } from "@/lib/shipping";

/** Kargo tarifelerini veritabanından okur (admin panelinden yönetilir). */
export async function loadTariffs(): Promise<Record<ProfileCode, ProfileTariff>> {
  const rows = await prisma.shippingProfile.findMany({ include: { rates: { orderBy: { minWeight: "asc" } } } });
  const out = {} as Record<ProfileCode, ProfileTariff>;
  for (const r of rows) {
    if (r.code !== "STD" && r.code !== "AGIR" && r.code !== "HACIM") continue;
    out[r.code] = {
      code: r.code,
      packing: r.packing,
      baseIncludes: Number(r.baseIncludes),
      basePrice: Number(r.basePrice),
      unitPrice: Number(r.unitPrice),
      freeShippingEligible: r.freeShippingEligible,
      tiers: r.rates.map((t) => ({ min: Number(t.minWeight), max: Number(t.maxWeight), price: Number(t.price) })),
    };
  }
  for (const c of ["STD", "AGIR", "HACIM"] as const) if (!out[c]) throw new Error(`Kargo profili tanımlı değil: ${c}`);
  return out;
}

export async function freeShippingThreshold(): Promise<number | null> {
  const s = await prisma.siteSetting.findUnique({ where: { key: "shipping.freeThreshold" } });
  const v = s ? Number(s.value) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

export type QuoteLine = {
  qty: number;
  name: string;
  profileCode: string;
  freeShipping: boolean;
  weightKg: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
};

/**
 * Sunucu tarafı kargo hesabı. Fiyat/ölçü bilgileri istemciden DEĞİL, veritabanındaki üründen gelir.
 * cartTotal: indirimler sonrası ürün toplamı (KDV dahil).
 */
export async function quoteShipping(lines: QuoteLine[], cartTotal: number, shippingMethodId?: string | null) {
  const [tariffs, threshold, method] = await Promise.all([
    loadTariffs(),
    freeShippingThreshold(),
    shippingMethodId ? prisma.shippingMethod.findFirst({ where: { id: shippingMethodId, isActive: true } }) : null,
  ]);
  const cl: CartLine[] = lines.map((l) => ({
    qty: l.qty,
    profile: (["STD", "AGIR", "HACIM"].includes(l.profileCode) ? l.profileCode : "STD") as ProfileCode,
    freeShipping: l.freeShipping,
    label: l.name,
    dims: { weightKg: l.weightKg, widthCm: l.widthCm, heightCm: l.heightCm, lengthCm: l.lengthCm },
  }));
  const r = calculateShipping(cl, tariffs, { cartTotal, freeShippingThreshold: threshold, methodFee: method ? Number(method.extraFee) : 0 });
  const remainingForFree = threshold && !r.thresholdMet ? Math.max(0, Math.round((threshold - cartTotal) * 100) / 100) : 0;
  return { ...r, threshold, remainingForFree, method };
}
