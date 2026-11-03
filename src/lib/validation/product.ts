import { z } from "zod";
import { parseDecimal, parseMoney } from "../money";
import { barcodeProblem, normalizeBarcode } from "../barcode";

export const SALE_UNITS = ["ADET", "PAKET", "KUTU", "TORBA", "KOVA", "BOY", "METRE", "METREKARE", "TON"] as const;
export const SALE_UNIT_LABELS: Record<(typeof SALE_UNITS)[number], string> = {
  ADET: "Adet", PAKET: "Paket", KUTU: "Kutu", TORBA: "Torba", KOVA: "Kova", BOY: "Boy", METRE: "Metre", METREKARE: "m²", TON: "Ton",
};
export const VAT_RATES = [20, 10, 1, 0] as const;

const toMoney = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : parseMoney(v) ?? Number.NaN);
const money = (label: string) =>
  z.preprocess(
    toMoney,
    z.number({ required_error: `${label} girin.`, invalid_type_error: `${label} geçerli bir tutar olmalı (ör. 1.250,00).` })
      .positive(`${label} 0'dan büyük olmalı.`)
      .max(10_000_000, `${label} çok yüksek.`),
  );
const optionalMoney = (label: string) =>
  z.preprocess(
    toMoney,
    z.number({ invalid_type_error: `${label} geçerli bir tutar olmalı (ör. 1.250,00).` })
      .positive(`${label} 0'dan büyük olmalı.`)
      .max(10_000_000, `${label} çok yüksek.`)
      .optional(),
  );

const measure = (label: string, unit: string, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : parseDecimal(v) ?? Number.NaN),
    z.number({ required_error: `${label} girin (${unit}).`, invalid_type_error: `${label} sayı olmalı (${unit}).` })
      .positive(`${label} 0'dan büyük olmalı.`)
      .max(max, `${label} en fazla ${max} ${unit} olabilir.`),
  );

const int = (label: string, max = 1_000_000) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : Number(String(v).replace(/\./g, ""))),
    z.number({ invalid_type_error: `${label} tam sayı olmalı.` }).int(`${label} tam sayı olmalı.`).min(0, `${label} negatif olamaz.`).max(max),
  );

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v), z.string().max(max).optional());

export const specRowSchema = z.object({
  label: z.string().trim().min(1, "Özellik adı boş olamaz.").max(60),
  value: z.string().trim().min(1, "Özellik değeri boş olamaz.").max(160),
});

export const productInputSchema = z
  .object({
    name: z.string({ required_error: "Ürün adı girin." }).trim().min(3, "Ürün adı en az 3 karakter olmalı.").max(200),
    sku: z
      .string({ required_error: "Ürün kodu girin." })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, "Ürün kodu harf, rakam, nokta, tire ve alt çizgiden oluşmalı (2–40 karakter)."),
    barcode: z.preprocess(
      (v) => (typeof v === "string" ? (normalizeBarcode(v) === "" ? undefined : normalizeBarcode(v)) : v),
      z
        .string()
        .superRefine((v, ctx) => {
          const p = barcodeProblem(v);
          if (p) ctx.addIssue({ code: "custom", message: p });
        })
        .optional(),
    ),
    mainCategoryId: z.string({ required_error: "Ana kategori seçin." }).min(1, "Ana kategori seçin."),
    subCategoryId: optionalText(40),
    brandId: optionalText(40),
    model: optionalText(80),
    shortDescription: optionalText(300),
    description: optionalText(20000),
    specs: z.array(specRowSchema).max(40, "En fazla 40 teknik özellik eklenebilir."),
    price: money("Satış fiyatı"),
    salePrice: optionalMoney("İndirimli fiyat"),
    purchasePrice: optionalMoney("Alış fiyatı"),
    vatRate: z.coerce.number().refine((v) => (VAT_RATES as readonly number[]).includes(v), "KDV oranı %20, %10, %1 veya %0 olmalı."),
    stock: int("Stok miktarı"),
    minStock: int("Minimum stok"),
    saleUnit: z.enum(SALE_UNITS, { errorMap: () => ({ message: "Satış birimi seçin." }) }),
    weightKg: measure("Ağırlık", "kg", 5000),
    widthCm: measure("En", "cm", 2000),
    heightCm: measure("Yükseklik", "cm", 2000),
    lengthCm: measure("Boy", "cm", 2000),
    shippingProfileId: z.string({ required_error: "Kargo profili seçin." }).min(1, "Kargo profili seçin."),
    handlingDays: z.preprocess((v) => (v === "" || v === undefined ? 2 : Number(v)), z.number().int().min(0).max(60)),
    status: z.enum(["ACTIVE", "PASSIVE"], { errorMap: () => ({ message: "Durum seçin." }) }),
    isFeatured: z.boolean(),
    freeShipping: z.boolean(),
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
  })
  .superRefine((v, ctx) => {
    if (v.salePrice !== undefined && v.salePrice >= v.price) {
      ctx.addIssue({ code: "custom", path: ["salePrice"], message: "İndirimli fiyat satış fiyatından düşük olmalı." });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

/** FormData → doğrulanmamış düz nesne (specs JSON olarak gelir) */
export function productFormToObject(fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const key of [
    "name", "sku", "barcode", "mainCategoryId", "subCategoryId", "brandId", "model", "shortDescription", "description",
    "price", "salePrice", "purchasePrice", "vatRate", "stock", "minStock", "saleUnit", "weightKg", "widthCm",
    "heightCm", "lengthCm", "shippingProfileId", "handlingDays", "status", "seoTitle", "seoDescription",
  ]) {
    const v = fd.get(key);
    o[key] = typeof v === "string" ? v : undefined;
  }
  o.isFeatured = fd.get("isFeatured") === "on" || fd.get("isFeatured") === "true";
  o.freeShipping = fd.get("freeShipping") === "on" || fd.get("freeShipping") === "true";
  let specs: unknown = [];
  try {
    specs = JSON.parse(String(fd.get("specs") ?? "[]"));
  } catch {
    specs = null;
  }
  o.specs = Array.isArray(specs)
    ? specs.filter((r) => r && (String(r.label ?? "").trim() !== "" || String(r.value ?? "").trim() !== ""))
    : specs;
  return o;
}

/** Zod hatalarını alan → mesaj sözlüğüne çevirir */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] === "specs" ? "specs" : String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.path[0] === "specs" && issue.path.length > 1 ? `Teknik özellik ${Number(issue.path[1]) + 1}: ${issue.message}` : issue.message;
  }
  return out;
}
