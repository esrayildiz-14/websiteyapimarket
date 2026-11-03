import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { slugify } from "@/lib/slug";
import { deleteStoredFile, fileFrom, keyFromUrl, saveImage, UploadError } from "@/lib/storage";
import { brandInputSchema, categoryInputSchema, formObject, zodErrors } from "@/lib/validation/catalog";

export type Result = { ok: true; id: string } | { ok: false; message: string; errors?: Record<string, string> };
const fail = (message: string, errors?: Record<string, string>): Result => ({ ok: false, message, errors });

// ---------------------------------------------------------------- kategoriler
// Kurallar
//  - En fazla iki seviye: ana kategori → alt kategori.
//  - Alt kategorisi olan kategori başka bir kategorinin altına taşınamaz.
//  - Doğrudan ürünü olan kategoriye alt kategori eklenemez (ürünler yaprak kategoride durur).
//  - Ürünü veya alt kategorisi olan kategori silinemez; pasif yapılabilir.
//  - Pasif kategori ve pasif ana kategorinin alt kategorileri sitede görünmez.

async function categorySlug(input: { name: string; slug?: string }, parentId: string | null, exceptId?: string) {
  let base = input.slug;
  if (!base) {
    const parent = parentId ? await prisma.category.findUnique({ where: { id: parentId } }) : null;
    base = parent ? `${parent.slug}-${slugify(input.name)}` : slugify(input.name);
  }
  base = base || "kategori";
  for (let i = 1; i < 200; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    const hit = await prisma.category.findUnique({ where: { slug: s }, select: { id: true } });
    if (!hit || hit.id === exceptId) return s;
  }
  return `${base}-${Date.now()}`;
}

async function checkCategory(input: ReturnType<typeof categoryInputSchema.parse>, id?: string) {
  const errors: Record<string, string> = {};
  const parentId = input.parentId ?? null;
  if (parentId) {
    if (parentId === id) errors.parentId = "Kategori kendi altına taşınamaz.";
    const parent = await prisma.category.findUnique({ where: { id: parentId }, include: { _count: { select: { products: true } } } });
    if (!parent) errors.parentId = "Üst kategori bulunamadı.";
    else if (parent.parentId) errors.parentId = "Alt kategori yalnız bir ana kategorinin altına eklenebilir (en fazla iki seviye).";
    else if (parent._count.products > 0)
      errors.parentId = `"${parent.name}" kategorisinde doğrudan ${parent._count.products} ürün var. Önce ürünleri bir alt kategoriye taşıyın.`;
    if (id) {
      const children = await prisma.category.count({ where: { parentId: id } });
      if (children > 0) errors.parentId = "Alt kategorileri olan bir ana kategori, başka bir kategorinin altına taşınamaz.";
    }
  }
  if (input.defaultShippingProfileId) {
    const p = await prisma.shippingProfile.findUnique({ where: { id: input.defaultShippingProfileId } });
    if (!p) errors.defaultShippingProfileId = "Kargo profili bulunamadı.";
  }
  const sameName = await prisma.category.findFirst({ where: { parentId, name: { equals: input.name, mode: "insensitive" }, NOT: id ? { id } : undefined } });
  if (sameName) errors.name = "Aynı seviyede bu adla bir kategori zaten var.";
  if (input.slug) {
    const hit = await prisma.category.findUnique({ where: { slug: input.slug } });
    if (hit && hit.id !== id) errors.slug = "Bu adres (slug) başka bir kategoride kullanılıyor.";
  }
  return errors;
}

const CATEGORY_KEYS = ["name", "parentId", "slug", "description", "seoTitle", "seoDescription", "defaultShippingProfileId", "sortOrder"];

export async function saveCategory(user: StaffUser, fd: FormData, id?: string): Promise<Result> {
  const parsed = categoryInputSchema.safeParse(formObject(fd, CATEGORY_KEYS, ["isActive"]));
  if (!parsed.success) return fail("Formda düzeltilmesi gereken alanlar var.", zodErrors(parsed.error));
  const input = parsed.data;
  const before = id ? await prisma.category.findUnique({ where: { id } }) : null;
  if (id && !before) return fail("Kategori bulunamadı.");

  const errors = await checkCategory(input, id);
  if (Object.keys(errors).length) return fail("Formda düzeltilmesi gereken alanlar var.", errors);

  let image: { url: string; storageKey: string } | null = null;
  const file = fileFrom(fd, "image");
  if (file) {
    try {
      image = await saveImage(file, "categories");
    } catch (e) {
      if (e instanceof UploadError) return fail("Görsel yüklenemedi.", { image: e.message });
      throw e;
    }
  }
  const removeImage = fd.get("removeImage") === "on";
  const parentId = input.parentId ?? null;
  const slug = before && !input.slug && before.name === input.name && before.parentId === parentId ? before.slug : await categorySlug(input, parentId, id);

  const data = {
    name: input.name,
    slug,
    parentId,
    description: input.description ?? null,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
    defaultShippingProfileId: input.defaultShippingProfileId ?? null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    ...(image ? { imageUrl: image.url } : removeImage ? { imageUrl: null } : {}),
  };
  const saved = id ? await prisma.category.update({ where: { id }, data }) : await prisma.category.create({ data });
  if (before && (image || removeImage)) await deleteStoredFile(keyFromUrl(before.imageUrl));
  await audit(user.id, id ? "category.update" : "category.create", "Category", saved.id,
    before ? { name: before.name, parentId: before.parentId, isActive: before.isActive } : undefined,
    { name: saved.name, parentId: saved.parentId, isActive: saved.isActive });
  return { ok: true, id: saved.id };
}

export async function deleteCategory(user: StaffUser, id: string): Promise<Result> {
  const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
  if (!c) return fail("Kategori bulunamadı.");
  if (c._count.children > 0) return fail(`"${c.name}" kategorisinin ${c._count.children} alt kategorisi var; önce onları silin veya taşıyın.`);
  if (c._count.products > 0)
    return fail(`"${c.name}" kategorisinde ${c._count.products} ürün kaydı var (silinmiş ürünler dahil). Kategori silinemez; pasif yapabilirsiniz.`);
  await prisma.category.delete({ where: { id } });
  await deleteStoredFile(keyFromUrl(c.imageUrl));
  await audit(user.id, "category.delete", "Category", id, { name: c.name, parentId: c.parentId }, undefined);
  return { ok: true, id };
}

export async function toggleCategory(user: StaffUser, id: string) {
  const c = await prisma.category.findUnique({ where: { id } });
  if (!c) return false;
  await prisma.category.update({ where: { id }, data: { isActive: !c.isActive } });
  await audit(user.id, "category.status", "Category", id, { isActive: c.isActive }, { isActive: !c.isActive });
  return true;
}

/** Aynı seviyedeki komşusuyla yer değiştirir (yukarı / aşağı). Sıra numaraları 0..n olarak yeniden yazılır. */
export async function moveCategory(user: StaffUser, id: string, dir: "up" | "down") {
  const c = await prisma.category.findUnique({ where: { id } });
  if (!c) return false;
  const siblings = await prisma.category.findMany({ where: { parentId: c.parentId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const i = siblings.findIndex((s) => s.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return true;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  await prisma.$transaction(siblings.map((s, k) => prisma.category.update({ where: { id: s.id }, data: { sortOrder: k } })));
  await audit(user.id, "category.move", "Category", id, undefined, { dir });
  return true;
}

// ---------------------------------------------------------------- markalar

export async function saveBrand(user: StaffUser, fd: FormData, id?: string): Promise<Result> {
  const parsed = brandInputSchema.safeParse(formObject(fd, ["name", "slug", "description", "sortOrder"], ["isActive"]));
  if (!parsed.success) return fail("Formda düzeltilmesi gereken alanlar var.", zodErrors(parsed.error));
  const input = parsed.data;
  const before = id ? await prisma.brand.findUnique({ where: { id } }) : null;
  if (id && !before) return fail("Marka bulunamadı.");

  const errors: Record<string, string> = {};
  const byName = await prisma.brand.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } } });
  if (byName && byName.id !== id) errors.name = "Bu adla bir marka zaten var.";
  const slug = input.slug ?? (before && before.name === input.name ? before.slug : slugify(input.name) || "marka");
  const bySlug = await prisma.brand.findUnique({ where: { slug } });
  if (bySlug && bySlug.id !== id) errors.slug = "Bu adres (slug) başka bir markada kullanılıyor.";
  if (Object.keys(errors).length) return fail("Formda düzeltilmesi gereken alanlar var.", errors);

  let logo: { url: string; storageKey: string } | null = null;
  const file = fileFrom(fd, "logo");
  if (file) {
    try {
      logo = await saveImage(file, "brands");
    } catch (e) {
      if (e instanceof UploadError) return fail("Logo yüklenemedi.", { logo: e.message });
      throw e;
    }
  }
  const removeLogo = fd.get("removeLogo") === "on";
  const data = {
    name: input.name,
    slug,
    description: input.description ?? null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    ...(logo ? { logoUrl: logo.url } : removeLogo ? { logoUrl: null } : {}),
  };
  const saved = id ? await prisma.brand.update({ where: { id }, data }) : await prisma.brand.create({ data });
  if (before && (logo || removeLogo)) await deleteStoredFile(keyFromUrl(before.logoUrl));
  await audit(user.id, id ? "brand.update" : "brand.create", "Brand", saved.id,
    before ? { name: before.name, isActive: before.isActive } : undefined, { name: saved.name, isActive: saved.isActive });
  return { ok: true, id: saved.id };
}

/** Ürünü olan marka silinmez (ürünlerden marka bilgisi kaybolmasın); pasif yapılabilir. */
export async function deleteBrand(user: StaffUser, id: string): Promise<Result> {
  const b = await prisma.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!b) return fail("Marka bulunamadı.");
  if (b._count.products > 0) return fail(`"${b.name}" markasına bağlı ${b._count.products} ürün var. Marka silinemez; pasif yapabilirsiniz.`);
  await prisma.brand.delete({ where: { id } });
  await deleteStoredFile(keyFromUrl(b.logoUrl));
  await audit(user.id, "brand.delete", "Brand", id, { name: b.name }, undefined);
  return { ok: true, id };
}
