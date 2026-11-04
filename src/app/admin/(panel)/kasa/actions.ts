"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { cancelSale, completeSale, lookup, returnItems, type LookupResult, type SaleResult } from "@/server/pos";

export async function lookupAction(code: string, warehouseId: string): Promise<LookupResult> {
  await requireStaff("pos.sell");
  return lookup(String(code).slice(0, 64), String(warehouseId));
}

export async function completeSaleAction(payload: unknown): Promise<SaleResult> {
  const user = await requireStaff("pos.sell");
  const r = await completeSale(user, payload);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function cancelSaleAction(fd: FormData) {
  const user = await requireStaff("pos.refund");
  const id = String(fd.get("saleId"));
  const r = await cancelSale(user, id, String(fd.get("reason") ?? ""));
  revalidatePath("/", "layout");
  redirect(withMsg(`/admin/kasa/${id}`, r.ok ? "ok" : "hata", r.message));
}

export async function returnAction(fd: FormData) {
  const user = await requireStaff("pos.refund");
  const id = String(fd.get("saleId"));
  const lines: { itemId: string; quantity: number; restock: boolean }[] = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("qty_") && String(v).trim() !== "") {
      const itemId = k.slice(4);
      lines.push({ itemId, quantity: Number(v), restock: fd.get(`restock_${itemId}`) === "on" });
    }
  }
  const method = fd.get("method") === "CARD" ? "CARD" : "CASH";
  const r = await returnItems(user, id, lines, String(fd.get("reason") ?? ""), method);
  revalidatePath("/", "layout");
  redirect(withMsg(`/admin/kasa/${id}`, r.ok ? "ok" : "hata", r.message));
}
