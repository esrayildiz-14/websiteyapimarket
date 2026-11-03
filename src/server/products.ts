import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type StaffUser } from "@/lib/auth/session";
import { slugify } from "@/lib/slug";
import { suggestProfile } from "@/lib/shipping";
import { deleteStoredFile, saveImage, UploadError } from "@/lib/storage";
import { MAX_IMAGES_PER_PRODUCT } from "@/lib/image";
import { adjustStock, setMinStock, setStock, StockError } from "./inventory";
import { fieldErrors, productFormToObject, productInputSchema, type ProductInput } from "@/lib/validation/product";

export type SaveResult =
  | { ok: true; id: string; slug: string; warnings: string[] }
  | { ok: false; message: string; errors: Record<string, string> };

const fail = (message: string, errors: Record<string, string> = {}): SaveResult => ({ ok: false, message, errors });

/** Kategori, marka ve kargo profili seçimlerini veritabanına göre doğrular. */
async function resolveRelations(input: ProductInput) {
  const errors: Record<string, string> = {};
  const main = await prisma.category.findUnique({ where: { id: input.mainCategoryId }, include: { children: { where: { isActive: true } } } });
  let categoryId: string | null = null;
  if (!main || main.parentId !== null) errors.mainCategoryId = "Geçerli bir ana kategori seçin.";
  else if (!main.isActive) errors.mainCategoryId = "Seçilen ana kategori pasif.";
  else if (main.children.length > 0) {
    const sub = main.children.find((c) => c.id === input.subCategoryId);
    if (!input.subCategoryId) errors.subCategoryId = "Bu ana kategori için alt kategori seçin.";
    else if (!sub) errors.subCategoryId = "Alt kategori seçilen ana kategoriye ait değil.";
    else categoryId = sub.id;
  } else categoryId = main.id;

  if (input.brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: input.brandId } });
    if (!brand) errors.brandId = "Geçerli bir marka seçin.";
  }
  const profile = await prisma.shippingProfile.findUnique({ where: { id: input.shippingProfileId } });
  if (!profile) errors.shippingProfileId = "Geçerli bir kargo profili seçin.";

  // Kargoyla gönderilemeyecek ürün aktif yapılamaz (SHP-10)
  const suggestion = suggestProfile({ weightKg: input.weightKg, widthCm: input.widthCm, heightCm: input.heightCm, lengthCm: input.lengthCm });
  const warnings: string[] = [];
  if (suggestion.code === null && input.status === "ACTIVE") errors.status = `${suggestion.reason} Ürün aktif yapılamaz.`;
  else if (profile && suggestion.code && profile.code !== suggestion.code)
    warnings.push(`Ölçü ve ağırlığa göre önerilen kargo profili "${suggestion.code}", seçilen "${profile.code}".`);

  return { errors, categoryId, warnings };
}

async function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name) || "urun";
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const hit = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${base}-${Date.now()}`;
}

async function uniqueness(input: ProductInput, exceptId?: string) {
  const errors: Record<string, string> = {};
  const sku = await prisma.product.findUnique({ where: { sku: input.sku }, select: { id: true } });
  if (sku && sku.id !== exceptId) errors.sku = "Bu ürün kodu başka bir üründe kullanılıyor.";
  if (input.barcode) {
    const bc = await prisma.product.findUnique({ where: { barcode: input.barcode }, select: { id: true } });
    if (bc && bc.id !== exceptId) errors.barcode = "Bu barkod başka bir üründe kullanılıyor.";
  }
  return errors;
}

function dataFrom(input: ProductInput, categoryId: string, user: StaffUser) {
  return {
    name: input.name,
    sku: input.sku,
    barcode: input.barcode ?? null,
    categoryId,
    brandId: input.brandId ?? null,
    shortDescription: input.shortDescription ?? null,
    description: input.description ?? null,
    specs: input.specs,
    price: input.price,
    salePrice: input.salePrice ?? null,
    ...(can(user, "product.purchase_price") ? { purchasePrice: input.purchasePrice ?? null } : {}),
    vatRate: input.vatRate,
    saleUnit: input.saleUnit,
    model: input.model ?? null,
    freeShipping: input.freeShipping,
    weightKg: input.weightKg,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    lengthCm: input.lengthCm,
    shippingProfileId: input.shippingProfileId,
    handlingDays: input.handlingDays,
    status: input.status,
    isFeatured: input.isFeatured,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
  };
}

function imageFiles(fd: FormData): File[] {
  return fd.getAll("images").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
}

async function storeImages(files: File[]) {
  const saved: { url: string; storageKey: string }[] = [];
  try {
    for (const f of files) saved.push(await saveImage(f, "products"));
    return saved;
  } catch (e) {
    for (const s of saved) await deleteStoredFile(s.storageKey);
    throw e;
  }
}

export async function createProduct(user: StaffUser, fd: FormData): Promise<SaveResult> {
  const parsed = productInputSchema.safeParse(productFormToObject(fd));
  if (!parsed.success) return fail("Formda düzeltilmesi gereken alanlar var.", fieldErrors(parsed.error));
  const input = parsed.data;

  const rel = await resolveRelations(input);
  const uniq = await uniqueness(input);
  const errors = { ...rel.errors, ...uniq };
  const files = imageFiles(fd);
  if (files.length > MAX_IMAGES_PER_PRODUCT) errors.images = `En fazla ${MAX_IMAGES_PER_PRODUCT} görsel yüklenebilir.`;
  if (Object.keys(errors).length || !rel.categoryId) return fail("Formda düzeltilmesi gereken alanlar var.", errors);

  let saved: { url: string; storageKey: string }[] = [];
  try {
    saved = await storeImages(files);
  } catch (e) {
    if (e instanceof UploadError) return fail("Görsel yüklenemedi.", { images: e.message });
    throw e;
  }

  try {
    const slug = await uniqueSlug(input.name);
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          ...dataFrom(input, rel.categoryId!, user),
          slug,
          inventory: { create: { quantity: 0, minStock: input.minStock } },
          images: { create: saved.map((s, i) => ({ ...s, alt: input.name, sortOrder: i })) },
          priceHistory: { create: { price: input.price, salePrice: input.salePrice ?? null, changedById: user.id } },
        },
      });
      // ilk stok varsayılan depoya giriş hareketi olarak yazılır
      if (input.stock > 0) await adjustStock(tx, { productId: p.id }, input.stock, "PURCHASE_IN", { userId: user.id, note: "İlk stok (ürün oluşturma)" });
      return p;
    });
    await audit(user.id, "product.create", "Product", product.id, undefined, { sku: product.sku, name: product.name, status: product.status });
    return { ok: true, id: product.id, slug: product.slug, warnings: rel.warnings };
  } catch (e) {
    for (const s of saved) await deleteStoredFile(s.storageKey);
    if (isUniqueError(e)) return fail("Ürün kodu veya barkod başka bir üründe kullanılıyor.", { sku: "Ürün kodu veya barkod benzersiz olmalı." });
    throw e;
  }
}

export async function updateProduct(user: StaffUser, id: string, fd: FormData): Promise<SaveResult> {
  const before = await prisma.product.findUnique({ where: { id }, include: { images: true, inventory: true } });
  if (!before || before.deletedAt) return fail("Ürün bulunamadı veya silinmiş.");

  const parsed = productInputSchema.safeParse(productFormToObject(fd));
  if (!parsed.success) return fail("Formda düzeltilmesi gereken alanlar var.", fieldErrors(parsed.error));
  const input = parsed.data;

  const rel = await resolveRelations(input);
  const uniq = await uniqueness(input, id);
  const errors = { ...rel.errors, ...uniq };
  const files = imageFiles(fd);
  if (before.images.length + files.length > MAX_IMAGES_PER_PRODUCT)
    errors.images = `Bir üründe en fazla ${MAX_IMAGES_PER_PRODUCT} görsel olabilir (şu an ${before.images.length}).`;
  if (Object.keys(errors).length || !rel.categoryId) return fail("Formda düzeltilmesi gereken alanlar var.", errors);

  let saved: { url: string; storageKey: string }[] = [];
  try {
    saved = await storeImages(files);
  } catch (e) {
    if (e instanceof UploadError) return fail("Görsel yüklenemedi.", { images: e.message });
    throw e;
  }

  const priceChanged = Number(before.price) !== input.price || (before.salePrice === null ? null : Number(before.salePrice)) !== (input.salePrice ?? null);
  const beforeStock = before.inventory?.quantity ?? 0;
  const slug = before.name === input.name ? before.slug : await uniqueSlug(input.name, id);

  try {
    const after = await prisma.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id },
        data: {
          ...dataFrom(input, rel.categoryId!, user),
          slug,
          images: { create: saved.map((s, i) => ({ ...s, alt: input.name, sortOrder: before.images.length + i })) },
        },
      });
      if (priceChanged)
        await tx.priceHistory.create({ data: { productId: id, price: input.price, salePrice: input.salePrice ?? null, changedById: user.id } });
      const stock = await setStock(tx, { productId: id }, input.stock, { userId: user.id, note: "Ürün formundan stok düzeltmesi" });
      await setMinStock(tx, { productId: id }, input.minStock);
      return { ...p, stock };
    });
    await audit(user.id, "product.update", "Product", id,
      { name: before.name, price: before.price, salePrice: before.salePrice, stock: beforeStock, status: before.status },
      { name: after.name, price: after.price, salePrice: after.salePrice, stock: after.stock, status: after.status });
    return { ok: true, id, slug: after.slug, warnings: rel.warnings };
  } catch (e) {
    for (const s of saved) await deleteStoredFile(s.storageKey);
    if (e instanceof StockError) return fail(e.message, { stock: e.message });
    if (isUniqueError(e)) return fail("Ürün kodu veya barkod başka bir üründe kullanılıyor.", { sku: "Ürün kodu veya barkod benzersiz olmalı." });
    throw e;
  }
}

/** Yumuşak silme: ürün yayından kalkar, eski siparişlerdeki satırlar bozulmaz. */
export async function softDeleteProduct(user: StaffUser, id: string) {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p || p.deletedAt) return false;
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: "PASSIVE" } });
  await audit(user.id, "product.delete", "Product", id, { sku: p.sku, status: p.status }, { deleted: true });
  return true;
}

export async function restoreProduct(user: StaffUser, id: string) {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p || !p.deletedAt) return false;
  await prisma.product.update({ where: { id }, data: { deletedAt: null, status: "PASSIVE" } });
  await audit(user.id, "product.restore", "Product", id, { deleted: true }, { deleted: false });
  return true;
}

export async function setProductStatus(user: StaffUser, id: string, status: "ACTIVE" | "PASSIVE") {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p || p.deletedAt) return { ok: false as const, message: "Ürün bulunamadı." };
  if (status === "ACTIVE") {
    const s = suggestProfile({ weightKg: Number(p.weightKg), widthCm: Number(p.widthCm), heightCm: Number(p.heightCm), lengthCm: Number(p.lengthCm) });
    if (s.code === null) return { ok: false as const, message: `${s.reason} Ürün aktif yapılamaz.` };
  }
  await prisma.product.update({ where: { id }, data: { status } });
  await audit(user.id, "product.status", "Product", id, { status: p.status }, { status });
  return { ok: true as const };
}

/** Kopya: pasif, stoksuz, görselsiz; kod ve ad işaretli */
export async function duplicateProduct(user: StaffUser, id: string) {
  const p = await prisma.product.findUnique({ where: { id }, include: { inventory: true } });
  if (!p) return null;
  let sku = `${p.sku}-KOPYA`.slice(0, 40);
  for (let i = 2; await prisma.product.findUnique({ where: { sku } }); i++) sku = `${p.sku}-KOPYA${i}`.slice(0, 40);
  const name = `${p.name} (kopya)`;
  const copy = await prisma.product.create({
    data: {
      name, slug: await uniqueSlug(name), sku, barcode: null, categoryId: p.categoryId, brandId: p.brandId,
      shortDescription: p.shortDescription, description: p.description, specs: p.specs ?? [], price: p.price, salePrice: p.salePrice,
      purchasePrice: p.purchasePrice, vatRate: p.vatRate, saleUnit: p.saleUnit, model: p.model, freeShipping: p.freeShipping,
      inventory: { create: { quantity: 0, minStock: p.inventory?.minStock ?? 0 } },
      weightKg: p.weightKg, widthCm: p.widthCm, heightCm: p.heightCm, lengthCm: p.lengthCm, shippingProfileId: p.shippingProfileId,
      handlingDays: p.handlingDays, status: "PASSIVE",
      priceHistory: { create: { price: p.price, salePrice: p.salePrice, changedById: user.id } },
    },
  });
  await audit(user.id, "product.duplicate", "Product", copy.id, { from: p.id }, { sku });
  return copy;
}

export async function deleteProductImage(user: StaffUser, productId: string, imageId: string) {
  const img = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
  if (!img) return false;
  await prisma.productImage.delete({ where: { id: imageId } });
  await deleteStoredFile(img.storageKey);
  // Sıra numaralarını sıkıştır (kapak her zaman 0)
  const rest = await prisma.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
  await prisma.$transaction(rest.map((r, i) => prisma.productImage.update({ where: { id: r.id }, data: { sortOrder: i } })));
  await audit(user.id, "product.image.delete", "Product", productId, { imageId }, undefined);
  return true;
}

export async function makeCoverImage(user: StaffUser, productId: string, imageId: string) {
  const imgs = await prisma.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
  const target = imgs.find((i) => i.id === imageId);
  if (!target) return false;
  const ordered = [target, ...imgs.filter((i) => i.id !== imageId)];
  await prisma.$transaction(ordered.map((r, i) => prisma.productImage.update({ where: { id: r.id }, data: { sortOrder: i } })));
  await audit(user.id, "product.image.cover", "Product", productId, undefined, { imageId });
  return true;
}

function isUniqueError(e: unknown) {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
}
