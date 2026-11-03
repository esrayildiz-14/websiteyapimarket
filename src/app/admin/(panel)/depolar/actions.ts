"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import type { FormState } from "@/components/admin/ActionForm";
import { createWarehouse, issue, transfer, updateWarehouse } from "@/server/warehouse-admin";

const form = (fd: FormData) => Object.fromEntries(fd.entries());

export async function createWarehouseAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("warehouse.write");
  const r = await createWarehouse(user, form(fd));
  if (!r.ok) return { message: r.message, errors: r.errors };
  redirect(withMsg("/admin/depolar", "ok", r.message));
}

export async function updateWarehouseAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("warehouse.write");
  const r = await updateWarehouse(user, id, form(fd));
  if (!r.ok) return { message: r.message, errors: r.errors };
  revalidatePath("/", "layout");
  redirect(withMsg(`/admin/depolar/${id}`, "ok", r.message));
}

export async function transferAction(fd: FormData) {
  const user = await requireStaff("warehouse.write");
  const r = await transfer(user, form(fd));
  revalidatePath("/", "layout");
  redirect(withMsg("/admin/depolar", r.ok ? "ok" : "hata", r.message));
}

export async function issueAction(fd: FormData) {
  const user = await requireStaff("warehouse.write");
  const r = await issue(user, form(fd));
  revalidatePath("/", "layout");
  redirect(withMsg("/admin/depolar", r.ok ? "ok" : "hata", r.message));
}
