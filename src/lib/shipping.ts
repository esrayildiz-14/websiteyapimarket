// Kargo profili ve ücret hesabı (SRS bölüm 9). Saf fonksiyonlar; eşikler parametreyle değiştirilebilir.

export type ProfileCode = "STD" | "AGIR" | "HACIM";

export const DEFAULT_LIMITS = {
  desiDivisor: 3000,
  heavyKg: 30, // üstü ağır
  maxKg: 50, // üstü kargoyla gönderilemez
  bulkyEdgeCm: 120, // en uzun kenar üstü hacimli
  bulkyDesi: 50,
  maxEdgeCm: 300, // üstü kargoyla gönderilemez
};

export type Dimensions = { weightKg: number; widthCm: number; heightCm: number; lengthCm: number };

/** Desi: en × boy × yükseklik / 3000, yukarı yuvarlanır */
export function desi(d: Dimensions, divisor = DEFAULT_LIMITS.desiDivisor): number {
  return Math.ceil((d.widthCm * d.heightCm * d.lengthCm) / divisor);
}

/** Ücrete esas ağırlık = max(gerçek kg, desi) */
export function chargeableWeight(d: Dimensions): number {
  return Math.max(Math.ceil(d.weightKg), desi(d));
}

export type ProfileSuggestion =
  | { code: ProfileCode; reason: string }
  | { code: null; reason: string };

/** Ağırlık ve ölçüden kargo profili önerir. code null ise ürün kargoyla gönderilemez. */
export function suggestProfile(d: Dimensions, opts: { bulkMaterial?: boolean } = {}, L = DEFAULT_LIMITS): ProfileSuggestion {
  const edge = Math.max(d.widthCm, d.heightCm, d.lengthCm);
  if (d.weightKg > L.maxKg) return { code: null, reason: `Tek parça ${L.maxKg} kg üstü kargoyla gönderilemez.` };
  if (edge > L.maxEdgeCm) return { code: null, reason: `En uzun kenar ${L.maxEdgeCm} cm üstü kargoyla gönderilemez.` };
  if (d.weightKg > L.heavyKg || opts.bulkMaterial) return { code: "AGIR", reason: opts.bulkMaterial ? "Torba / dökme ürün." : `Ağırlık ${L.heavyKg} kg üstü.` };
  const ds = desi(d, L.desiDivisor);
  if (edge > L.bulkyEdgeCm || ds > L.bulkyDesi) return { code: "HACIM", reason: edge > L.bulkyEdgeCm ? `En uzun kenar ${L.bulkyEdgeCm} cm üstü.` : `Desi ${L.bulkyDesi} üstü (${ds}).` };
  return { code: "STD", reason: "Standart ölçü ve ağırlık." };
}

export type ProfileTariff = {
  code: ProfileCode;
  packing: "COMBINED" | "PER_PIECE";
  baseIncludes: number;
  basePrice: number;
  unitPrice: number;
  freeShippingEligible: boolean;
  tiers: { min: number; max: number; price: number }[]; // STD kademeleri
};

export type CartLine = { qty: number; profile: ProfileCode; dims: Dimensions; freeShipping?: boolean; label?: string };

export type ShippingPackage = { profile: ProfileCode; description: string; units: number; fee: number; free: boolean; reason?: string };

/**
 * Sepetin kargo ücretini paket paket hesaplar (SRS 9, KRG kuralları).
 *
 * Kurallar — her parça TEK bir pakete girer, hiçbir parça iki kez ücretlendirilmez:
 *  K1 Standart (COMBINED): ücretli standart parçaların ücrete esas ağırlıkları (max(kg, desi)) aynı koliye
 *     toplanır; koli 30 kg/desi'yi aşacaksa yeni koli açılır. Her koli bir kez, kademe tarifesinden ücretlenir.
 *  K2 Ağır / hacimli (PER_PIECE): her parça ayrı taşınır: taban ücret + (kg|desi − tabana dahil) × birim ücret.
 *  K3 Ürüne özel ücretsiz kargo: bu parçalar kendi paketlerinde 0 ₺ gösterilir ve ücretli kolinin ağırlığına eklenmez.
 *  K4 Sepet tutarı eşiği: indirimler düşüldükten sonraki ürün toplamı eşiğe ulaşırsa, yalnız eşik kampanyasına
 *     dahil profillerin (freeShippingEligible) paketleri 0 ₺ olur. Ağır/hacimli profiller varsayılan olarak dahil değildir.
 *  K5 Teslimat yönteminin ek ücreti (varsa) sipariş başına bir kez eklenir.
 */
export function calculateShipping(
  lines: CartLine[],
  tariffs: Record<ProfileCode, ProfileTariff>,
  opts: { cartTotal?: number; freeShippingThreshold?: number | null; methodFee?: number } = {},
) {
  const packages: ShippingPackage[] = [];
  const thresholdMet =
    opts.freeShippingThreshold != null && opts.freeShippingThreshold > 0 && opts.cartTotal != null && opts.cartTotal >= opts.freeShippingThreshold;

  // K1 + K3 standart
  const std = tariffs.STD;
  const stdLines = lines.filter((x) => x.profile === "STD");
  const freeUnits = stdLines.filter((l) => l.freeShipping).reduce((n, l) => n + l.qty, 0);
  if (freeUnits > 0) packages.push({ profile: "STD", description: `Ücretsiz kargolu ürünler (${freeUnits} parça)`, units: freeUnits, fee: 0, free: true, reason: "Ürüne özel ücretsiz kargo" });
  const stdUnits: number[] = [];
  for (const l of stdLines.filter((x) => !x.freeShipping)) for (let i = 0; i < l.qty; i++) stdUnits.push(chargeableWeight(l.dims));
  const boxes: { w: number; n: number }[] = [];
  let cur = { w: 0, n: 0 };
  for (const w of stdUnits) {
    if (cur.n > 0 && cur.w + w > 30) {
      boxes.push(cur);
      cur = { w: 0, n: 0 };
    }
    cur = { w: cur.w + w, n: cur.n + 1 };
  }
  if (cur.n > 0) boxes.push(cur);
  for (const b of boxes) {
    const tier = std.tiers.find((t) => b.w > t.min && b.w <= t.max) ?? std.tiers[std.tiers.length - 1];
    const free = thresholdMet && std.freeShippingEligible;
    packages.push({
      profile: "STD",
      description: `Standart koli (${b.n} parça, ${b.w} kg/desi)`,
      units: b.n,
      fee: free ? 0 : tier ? tier.price : std.basePrice,
      free,
      reason: free ? "Sepet tutarı ücretsiz kargo sınırını geçti" : undefined,
    });
  }

  // K2 + K3 + K4 ağır / hacimli
  for (const code of ["AGIR", "HACIM"] as const) {
    const t = tariffs[code];
    for (const l of lines.filter((x) => x.profile === code)) {
      const basis = code === "AGIR" ? Math.ceil(l.dims.weightKg) : desi(l.dims);
      const perPiece = t.basePrice + Math.max(0, basis - t.baseIncludes) * t.unitPrice;
      const free = !!l.freeShipping || (thresholdMet && t.freeShippingEligible);
      packages.push({
        profile: code,
        description: `${l.label ? l.label + " — " : ""}${l.qty} parça ${code === "AGIR" ? "ağır yük" : "hacimli"} (${basis} ${code === "AGIR" ? "kg" : "desi"}/parça)`,
        units: l.qty,
        fee: free ? 0 : Math.round(perPiece * l.qty * 100) / 100,
        free,
        reason: l.freeShipping ? "Ürüne özel ücretsiz kargo" : free ? "Sepet tutarı ücretsiz kargo sınırını geçti" : undefined,
      });
    }
  }
  const methodFee = Math.max(0, opts.methodFee ?? 0);
  const total = Math.round((packages.reduce((s, p) => s + p.fee, 0) + (packages.length ? methodFee : 0)) * 100) / 100;
  return { packages, methodFee: packages.length ? methodFee : 0, total, thresholdMet };
}
