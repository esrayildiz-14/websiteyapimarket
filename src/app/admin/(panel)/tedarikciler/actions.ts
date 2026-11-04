"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import type { FormState } from "@/components/admin/ActionForm";
import { removeSupplierProduct, saveSupplier, saveSupplierProduct } from "@/server/supplier-admin";

const form = (fd: FormData) => Object.fromEntries(fd.entries());

export async function createSupplierAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("supplier.write");
  const r = await saveSupplier(user, form(fd));
  if (!r.ok) return { message: r.message, errors: r.errors };
  redirect(withMsg(`/admin/tedarikciler/${r.id}`, "ok", r.message));
}

export async function updateSupplierAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("supplier.write");
  const r = await saveSupplier(user, form(fd), id);
  if (!r.ok) return { message: r.message, errors: r.errors };
  redirect(withMsg(`/admin/tedarikciler/${id}`, "ok", r.message));
}

export async function supplierProductAction(fd: FormData) {
  const user = await requireStaff("supplier.write");
  const id = String(fd.get("supplierId"));
  const r = await saveSupplierProduct(user, id, form(fd));
  redirect(withMsg(`/admin/tedarikciler/${id}`, r.ok ? "ok" : "hata", r.message));
}

export async function removeSupplierProductAction(fd: FormData) {
  const user = await requireStaff("supplier.write");
  const id = String(fd.get("supplierId"));
  const r = await removeSupplierProduct(user, String(fd.get("id")));
  redirect(withMsg(`/admin/tedarikciler/${id}`, r.ok ? "ok" : "hata", r.message));
}
