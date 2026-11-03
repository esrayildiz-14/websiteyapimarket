"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import type { ProductFormState } from "@/components/admin/ProductForm";
import {
  createProduct, deleteProductImage, duplicateProduct, makeCoverImage, restoreProduct, setProductStatus, softDeleteProduct, updateProduct,
} from "@/server/products";

function refreshStorefront() {
  revalidatePath("/", "layout");
}

export async function createProductAction(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  const user = await requireStaff("product.write");
  const res = await createProduct(user, fd);
  if (!res.ok) return { message: res.message, errors: res.errors };
  refreshStorefront();
  const msg = "Ürün kaydedildi." + (res.warnings.length ? " " + res.warnings.join(" ") : "");
  redirect(withMsg(`/admin/urunler/${res.id}`, "ok", msg));
}

export async function updateProductAction(id: string, _prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  const user = await requireStaff("product.write");
  const res = await updateProduct(user, id, fd);
  if (!res.ok) return { message: res.message, errors: res.errors };
  refreshStorefront();
  const msg = "Değişiklikler kaydedildi." + (res.warnings.length ? " " + res.warnings.join(" ") : "");
  redirect(withMsg(`/admin/urunler/${id}`, "ok", msg));
}

export async function deleteProductAction(fd: FormData) {
  const user = await requireStaff("product.write");
  const id = String(fd.get("id"));
  const ok = await softDeleteProduct(user, id);
  refreshStorefront();
  redirect(withMsg("/admin/urunler", ok ? "ok" : "hata", ok ? "Ürün silindi. Silinenler listesinden geri alınabilir." : "Ürün bulunamadı."));
}

export async function restoreProductAction(fd: FormData) {
  const user = await requireStaff("product.write");
  const id = String(fd.get("id"));
  const ok = await restoreProduct(user, id);
  redirect(withMsg(`/admin/urunler/${id}`, ok ? "ok" : "hata", ok ? "Ürün geri alındı (pasif durumda)." : "Ürün geri alınamadı."));
}

export async function setStatusAction(fd: FormData) {
  const user = await requireStaff("product.write");
  const id = String(fd.get("id"));
  const status = fd.get("status") === "ACTIVE" ? "ACTIVE" : "PASSIVE";
  const back = String(fd.get("back") || `/admin/urunler/${id}`);
  const res = await setProductStatus(user, id, status);
  refreshStorefront();
  redirect(withMsg(back.startsWith("/admin") ? back : "/admin/urunler", res.ok ? "ok" : "hata", res.ok ? (status === "ACTIVE" ? "Ürün yayına alındı." : "Ürün yayından kaldırıldı.") : res.message));
}

export async function duplicateProductAction(fd: FormData) {
  const user = await requireStaff("product.write");
  const copy = await duplicateProduct(user, String(fd.get("id")));
  if (!copy) redirect(withMsg("/admin/urunler", "hata", "Ürün bulunamadı."));
  redirect(withMsg(`/admin/urunler/${copy.id}`, "ok", "Kopya oluşturuldu (pasif, stoksuz, görselsiz). Kodunu ve görsellerini düzenleyin."));
}

export async function deleteImageAction(fd: FormData) {
  const user = await requireStaff("product.write");
  const productId = String(fd.get("productId"));
  await deleteProductImage(user, productId, String(fd.get("imageId")));
  refreshStorefront();
  redirect(withMsg(`/admin/urunler/${productId}`, "ok", "Görsel silindi."));
}

export async function coverImageAction(fd: FormData) {
  const user = await requireStaff("product.write");
  const productId = String(fd.get("productId"));
  await makeCoverImage(user, productId, String(fd.get("imageId")));
  refreshStorefront();
  redirect(withMsg(`/admin/urunler/${productId}`, "ok", "Kapak görseli değiştirildi."));
}

/** Barkodu olmayan ürün için kullanılmayan bir mağaza içi EAN-13 (29… aralığı) üretir. Kaydetmez, yalnız önerir. */
export async function generateBarcodeAction(): Promise<string> {
  await requireStaff("product.write");
  const { randomInt } = await import("node:crypto");
  const { makeInternalBarcode } = await import("@/lib/barcode");
  const { prisma } = await import("@/lib/prisma");
  for (let i = 0; i < 20; i++) {
    const code = makeInternalBarcode(String(randomInt(0, 1e9)).padStart(9, "0") + String(randomInt(0, 10)));
    const used = (await prisma.product.findUnique({ where: { barcode: code } })) || (await prisma.productVariant.findUnique({ where: { barcode: code } }));
    if (!used) return code;
  }
  throw new Error("Barkod üretilemedi, tekrar deneyin.");
}
