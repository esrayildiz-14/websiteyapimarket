"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import type { FormState } from "@/components/admin/ActionForm";
import { deleteBrand, saveBrand } from "@/server/catalog-admin";

export async function createBrandAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("brand.write");
  const r = await saveBrand(user, fd);
  if (!r.ok) return { message: r.message, errors: r.errors };
  revalidatePath("/", "layout");
  redirect(withMsg("/admin/markalar", "ok", "Marka kaydedildi."));
}

export async function updateBrandAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("brand.write");
  const r = await saveBrand(user, fd, id);
  if (!r.ok) return { message: r.message, errors: r.errors };
  revalidatePath("/", "layout");
  redirect(withMsg(`/admin/markalar/${id}`, "ok", "Değişiklikler kaydedildi."));
}

export async function deleteBrandAction(fd: FormData) {
  const user = await requireStaff("brand.write");
  const id = String(fd.get("id"));
  const r = await deleteBrand(user, id);
  revalidatePath("/", "layout");
  if (!r.ok) redirect(withMsg(`/admin/markalar/${id}`, "hata", r.message));
  redirect(withMsg("/admin/markalar", "ok", "Marka silindi."));
}
