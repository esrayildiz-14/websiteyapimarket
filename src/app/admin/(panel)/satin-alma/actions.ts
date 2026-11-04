"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import {
  addPurchaseItem, approvePurchase, backToDraft, cancelPurchase, createPurchaseOrder, receiveGoods, removePurchaseItem, submitPurchase,
} from "@/server/purchase-admin";

const form = (fd: FormData) => Object.fromEntries(fd.entries());
const back = (id: string, r: { ok: boolean; message: string }) => redirect(withMsg(`/admin/satin-alma/${id}`, r.ok ? "ok" : "hata", r.message));

export async function createPurchaseAction(fd: FormData) {
  const user = await requireStaff("purchase.write");
  const r = await createPurchaseOrder(user, form(fd));
  if (!r.ok) redirect(withMsg("/admin/satin-alma?yeni=1", "hata", r.message));
  redirect(withMsg(`/admin/satin-alma/${r.id}`, "ok", r.message));
}

export async function addItemAction(fd: FormData) {
  const user = await requireStaff("purchase.write");
  const id = String(fd.get("poId"));
  back(id, await addPurchaseItem(user, id, form(fd)));
}

export async function removeItemAction(fd: FormData) {
  const user = await requireStaff("purchase.write");
  const id = String(fd.get("poId"));
  back(id, await removePurchaseItem(user, id, String(fd.get("itemId"))));
}

export async function submitAction(fd: FormData) {
  const user = await requireStaff("purchase.write");
  const id = String(fd.get("poId"));
  back(id, await submitPurchase(user, id));
}

export async function backToDraftAction(fd: FormData) {
  const user = await requireStaff("purchase.write");
  const id = String(fd.get("poId"));
  back(id, await backToDraft(user, id));
}

export async function approveAction(fd: FormData) {
  const user = await requireStaff("purchase.approve");
  const id = String(fd.get("poId"));
  back(id, await approvePurchase(user, id));
}

export async function cancelAction(fd: FormData) {
  const user = await requireStaff("purchase.write");
  const id = String(fd.get("poId"));
  back(id, await cancelPurchase(user, id, String(fd.get("reason") ?? "")));
}

export async function receiveAction(fd: FormData) {
  const user = await requireStaff("purchase.receive");
  const id = String(fd.get("poId"));
  const quantities: Record<string, number> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("qty_") && String(v).trim() !== "") quantities[k.slice(4)] = Number(v);
  }
  const r = await receiveGoods(user, id, form(fd), quantities);
  revalidatePath("/", "layout");
  back(id, r);
}
