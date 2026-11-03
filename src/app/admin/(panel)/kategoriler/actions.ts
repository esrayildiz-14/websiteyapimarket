"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import type { FormState } from "@/components/admin/ActionForm";
import { deleteCategory, moveCategory, saveCategory, toggleCategory } from "@/server/catalog-admin";

const refresh = () => revalidatePath("/", "layout");

export async function createCategoryAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("category.write");
  const r = await saveCategory(user, fd);
  if (!r.ok) return { message: r.message, errors: r.errors };
  refresh();
  redirect(withMsg("/admin/kategoriler", "ok", "Kategori kaydedildi."));
}

export async function updateCategoryAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("category.write");
  const r = await saveCategory(user, fd, id);
  if (!r.ok) return { message: r.message, errors: r.errors };
  refresh();
  redirect(withMsg(`/admin/kategoriler/${id}`, "ok", "Değişiklikler kaydedildi."));
}

export async function deleteCategoryAction(fd: FormData) {
  const user = await requireStaff("category.write");
  const id = String(fd.get("id"));
  const r = await deleteCategory(user, id);
  refresh();
  if (!r.ok) redirect(withMsg(`/admin/kategoriler/${id}`, "hata", r.message));
  redirect(withMsg("/admin/kategoriler", "ok", "Kategori silindi."));
}

export async function toggleCategoryAction(fd: FormData) {
  const user = await requireStaff("category.write");
  await toggleCategory(user, String(fd.get("id")));
  refresh();
  redirect(withMsg("/admin/kategoriler", "ok", "Kategori durumu değiştirildi."));
}

export async function moveCategoryAction(fd: FormData) {
  const user = await requireStaff("category.write");
  await moveCategory(user, String(fd.get("id")), fd.get("dir") === "up" ? "up" : "down");
  refresh();
  redirect("/admin/kategoriler");
}
