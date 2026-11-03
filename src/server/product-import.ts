import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { SALE_UNIT_LABELS, SALE_UNITS } from "@/lib/validation/product";
import { createProduct, updateProduct } from "./products";

/**
 * Excel (.xlsx) ile toplu ürün ekleme / güncelleme.
 * - Her satır, admin formundaki doğrulamanın aynısından geçer (createProduct / updateProduct).
 * - Ürün kodu (SKU) varsa ürün güncellenir, yoksa yeni ürün oluşturulur.
 * - Teknik özellikler yalnız dosyada verilen değerlerden alınır; sistem hiçbir özellik üretmez/tamamlamaz.
 * - "Bilgiler doğrulandı" sütunu "Evet" değilse ürün Aktif istense bile PASİF kaydedilir.
 * - Görseller Excel ile alınmaz; ürün sayfasından yüklenir.
 */
export const COLUMNS = [
  ["sku", "Ürün kodu (SKU)*"],
  ["name", "Ürün adı*"],
  ["barcode", "Barkod (EAN)"],
  ["brand", "Marka"],
  ["model", "Model"],
  ["main", "Ana kategori*"],
  ["sub", "Alt kategori"],
  ["shortDescription", "Kısa açıklama"],
  ["description", "Açıklama"],
  ["price", "Satış fiyatı (KDV dahil)*"],
  ["salePrice", "İndirimli fiyat"],
  ["purchasePrice", "Alış fiyatı"],
  ["vatRate", "KDV oranı (20/10/1/0)*"],
  ["saleUnit", "Satış birimi*"],
  ["stock", "Stok*"],
  ["minStock", "Minimum stok"],
  ["weightKg", "Ağırlık (kg)*"],
  ["widthCm", "En (cm)*"],
  ["heightCm", "Yükseklik (cm)*"],
  ["lengthCm", "Boy (cm)*"],
  ["profile", "Kargo profili (STD/AGIR/HACIM)*"],
  ["handlingDays", "Kargoya teslim (iş günü)"],
  ["freeShipping", "Ücretsiz kargo (Evet/Hayır)"],
  ["status", "Durum (Aktif/Pasif)"],
  ["verified", "Bilgiler doğrulandı (Evet/Hayır)"],
  ...Array.from({ length: 10 }, (_, i) => [
    [`spec${i + 1}l`, `Özellik ${i + 1} adı`],
    [`spec${i + 1}v`, `Özellik ${i + 1} değeri`],
  ]).flat(),
] as const;

export const MAX_ROWS = 2000;
const yes = (v: string) => ["evet", "e", "yes", "1", "true", "x"].includes(v.trim().toLocaleLowerCase("tr"));
const norm = (s: string | undefined | null) => (s ?? "").trim().toLocaleLowerCase("tr");

export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Öner Yapı Market";
  const ws = wb.addWorksheet("Ürünler", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map(([key, header]) => ({ key, header, width: Math.max(14, header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.addRow({
    sku: "ORNEK-001", name: "Örnek ürün adı — silin", main: "El Aletleri", sub: "Tornavidalar", price: "149,90", vatRate: 20, saleUnit: "Adet",
    stock: 10, weightKg: "0,3", widthCm: 5, heightCm: 3, lengthCm: 25, profile: "STD", status: "Pasif", verified: "Hayır",
  });

  const [cats, brands] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" }, include: { children: { orderBy: { sortOrder: "asc" } } } }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const lists = wb.addWorksheet("Listeler");
  lists.columns = [
    { header: "Ana kategori", key: "a", width: 34 },
    { header: "Alt kategori", key: "b", width: 40 },
    { header: "Marka", key: "c", width: 20 },
    { header: "Satış birimi", key: "d", width: 14 },
  ];
  lists.getRow(1).font = { bold: true };
  const rows: { a?: string; b?: string; c?: string; d?: string }[] = [];
  for (const m of cats) for (const c of m.children.length ? m.children : [null]) rows.push({ a: m.name, b: c?.name ?? "" });
  brands.forEach((b, i) => ((rows[i] ??= {}).c = b.name));
  SALE_UNITS.forEach((u, i) => ((rows[i] ??= {}).d = SALE_UNIT_LABELS[u]));
  lists.addRows(rows);

  const help = wb.addWorksheet("Açıklama");
  help.getColumn(1).width = 120;
  [
    "Yıldızlı (*) sütunlar zorunludur. Ondalık ayırıcı olarak virgül veya nokta kullanılabilir.",
    "Ürün kodu (SKU) sistemde varsa ürün GÜNCELLENİR, yoksa yeni ürün EKLENİR.",
    "Kategori ve marka adları 'Listeler' sayfasındaki adlarla aynı yazılmalıdır.",
    "Teknik özellikleri yalnız üretici/tedarikçi belgesiyle doğruladıysanız girin. Sistem özellik üretmez veya tamamlamaz.",
    "'Bilgiler doğrulandı' Evet değilse ürün Aktif yazılsa bile PASİF kaydedilir.",
    "Görseller Excel ile yüklenmez; ürün sayfasından eklenir.",
    `Bir dosyada en fazla ${MAX_ROWS} satır işlenir. Önce 'Kontrol et' ile hataları görün, sonra 'İçe aktar' ile kaydedin.`,
  ].forEach((t) => help.addRow([t]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type RowResult = { row: number; sku: string; action: "create" | "update" | "error"; message: string };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return String(v.result ?? "");
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

/** Dosyayı okur, her satırı doğrular; apply=true ise geçerli satırları kaydeder. */
export async function importProducts(user: StaffUser, file: File, apply: boolean) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false as const, message: "Yalnız .xlsx dosyası yüklenebilir." };
  if (file.size > 5 * 1024 * 1024) return { ok: false as const, message: "Dosya en fazla 5 MB olabilir." };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return { ok: false as const, message: "Dosya okunamadı. Şablondaki biçimde bir .xlsx dosyası yükleyin." };
  }
  const ws = wb.getWorksheet("Ürünler") ?? wb.worksheets[0];
  if (!ws) return { ok: false as const, message: "Dosyada çalışma sayfası yok." };
  const header = Array.from(ws.getRow(1).values as ExcelJS.CellValue[], (v) => cellText(v)); // dizi seyrek olabilir (1. indeksten başlar)
  const idx = new Map<string, number>();
  for (const [key, title] of COLUMNS) {
    const i = header.findIndex((h) => norm(h) === norm(title));
    if (i > 0) idx.set(key, i);
  }
  const missing = COLUMNS.filter(([k, t]) => t.endsWith("*") && !idx.has(k)).map(([, t]) => t);
  if (missing.length) return { ok: false as const, message: `Şablon sütunları eksik: ${missing.join(", ")}. Güncel şablonu indirin.` };

  const [cats, brands, profiles, existing] = await Promise.all([
    prisma.category.findMany({ include: { parent: true } }),
    prisma.brand.findMany(),
    prisma.shippingProfile.findMany(),
    prisma.product.findMany({ select: { id: true, sku: true, deletedAt: true } }),
  ]);
  const unitByLabel = new Map<string, string>(SALE_UNITS.flatMap((u) => [[norm(u), u], [norm(SALE_UNIT_LABELS[u]), u]]));
  const results: RowResult[] = [];
  const seen = new Set<string>();
  let dataRows = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: string) => (idx.has(k) ? cellText(row.getCell(idx.get(k)!).value) : "");
    if (COLUMNS.every(([k]) => get(k) === "")) continue;
    if (++dataRows > MAX_ROWS) {
      results.push({ row: r, sku: "", action: "error", message: `En fazla ${MAX_ROWS} satır işlenir; kalan satırlar atlandı.` });
      break;
    }
    const sku = get("sku").toUpperCase();
    const fail = (message: string) => results.push({ row: r, sku, action: "error", message });
    if (!sku) { fail("Ürün kodu boş."); continue; }
    if (seen.has(sku)) { fail("Bu ürün kodu dosyada birden fazla satırda var."); continue; }
    seen.add(sku);

    const main = cats.find((c) => !c.parentId && norm(c.name) === norm(get("main")));
    if (!main) { fail(`Ana kategori bulunamadı: "${get("main")}".`); continue; }
    const subName = get("sub");
    const sub = subName ? cats.find((c) => c.parentId === main.id && norm(c.name) === norm(subName)) : null;
    if (subName && !sub) { fail(`"${main.name}" altında alt kategori bulunamadı: "${subName}".`); continue; }
    const brandName = get("brand");
    const brand = brandName ? brands.find((b) => norm(b.name) === norm(brandName)) : null;
    if (brandName && !brand) { fail(`Marka bulunamadı: "${brandName}". Önce Markalar ekranından ekleyin.`); continue; }
    const profile = profiles.find((p) => p.code === get("profile").toUpperCase());
    if (!profile) { fail(`Kargo profili STD, AGIR veya HACIM olmalı ("${get("profile")}").`); continue; }
    const unit = unitByLabel.get(norm(get("saleUnit")));
    if (!unit) { fail(`Satış birimi tanınmadı: "${get("saleUnit")}".`); continue; }

    const specs: { label: string; value: string }[] = [];
    for (let i = 1; i <= 10; i++) {
      const l = get(`spec${i}l`), v = get(`spec${i}v`);
      if (l || v) specs.push({ label: l, value: v });
    }
    const verified = yes(get("verified"));
    const wantsActive = norm(get("status")) === "aktif";
    const fd = new FormData();
    const set = (k: string, v: string) => fd.set(k, v);
    set("name", get("name")); set("sku", sku); set("barcode", get("barcode")); set("brandId", brand?.id ?? ""); set("model", get("model"));
    set("mainCategoryId", main.id); set("subCategoryId", sub?.id ?? ""); set("shortDescription", get("shortDescription")); set("description", get("description"));
    set("specs", JSON.stringify(specs)); set("price", get("price")); set("salePrice", get("salePrice")); set("purchasePrice", get("purchasePrice"));
    set("vatRate", get("vatRate")); set("saleUnit", unit); set("stock", get("stock")); set("minStock", get("minStock") || "0");
    set("weightKg", get("weightKg")); set("widthCm", get("widthCm")); set("heightCm", get("heightCm")); set("lengthCm", get("lengthCm"));
    set("shippingProfileId", profile.id); set("handlingDays", get("handlingDays")); set("status", wantsActive && verified ? "ACTIVE" : "PASSIVE");
    if (yes(get("freeShipping"))) set("freeShipping", "on");

    const ex = existing.find((p) => p.sku === sku);
    if (ex?.deletedAt) { fail("Bu ürün kodu silinmiş bir üründe. Önce ürünü geri alın."); continue; }
    const note = wantsActive && !verified ? " (Bilgiler doğrulanmadığı için PASİF kaydedilir.)" : "";
    if (!apply) {
      // yalnız doğrulama: kayıt yapmadan şemayı dener
      const { productFormToObject, productInputSchema, fieldErrors } = await import("@/lib/validation/product");
      const parsed = productInputSchema.safeParse(productFormToObject(fd));
      if (!parsed.success) { fail(Object.values(fieldErrors(parsed.error)).join(" ")); continue; }
      results.push({ row: r, sku, action: ex ? "update" : "create", message: (ex ? "Güncellenecek." : "Eklenecek.") + note });
      continue;
    }
    const res = ex ? await updateProduct(user, ex.id, fd) : await createProduct(user, fd);
    if (!res.ok) fail(`${res.message} ${Object.values(res.errors).join(" ")}`.trim());
    else results.push({ row: r, sku, action: ex ? "update" : "create", message: (ex ? "Güncellendi." : "Eklendi.") + note + (res.warnings.length ? " " + res.warnings.join(" ") : "") });
  }
  if (apply) await audit(user.id, "product.import", "Product", null, undefined, { file: file.name, rows: results.length, errors: results.filter((x) => x.action === "error").length });
  return { ok: true as const, results };
}
