"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { stockEntry, updateMinStock } from "@/server/price-stock-admin";

export async function stockEntryAction(fd: FormData) {
  const user = await requireStaff("stock.write");
  const r = await stockEntry(user, { sku: fd.get("sku"), mode: fd.get("mode"), quantity: fd.get("quantity"), note: fd.get("note") || undefined, warehouseId: fd.get("warehouseId") || undefined });
  revalidatePath("/", "layout");
  redirect(withMsg("/admin/stok", r.ok ? "ok" : "hata", r.message));
}

export async function minStockAction(fd: FormData) {
  const user = await requireStaff("stock.write");
  const r = await updateMinStock(user, String(fd.get("id")), Number(fd.get("minStock")));
  redirect(withMsg("/admin/stok?durum=kritik", r.ok ? "ok" : "hata", r.message));
}
