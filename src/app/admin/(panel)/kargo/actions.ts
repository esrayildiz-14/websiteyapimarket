"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { saveCompany, saveMethod, updateFreeThreshold, updateProfile, updateShipment } from "@/server/shipping-admin";

const go = (tab: string, r: { ok: boolean; message: string }) => redirect(withMsg(`/admin/kargo?sekme=${tab}`, r.ok ? "ok" : "hata", r.message));

export async function profileAction(fd: FormData) {
  const user = await requireStaff("shipping.write");
  const r = await updateProfile(user, fd);
  revalidatePath("/", "layout");
  go("profiller", r);
}
export async function thresholdAction(fd: FormData) {
  const user = await requireStaff("shipping.write");
  const r = await updateFreeThreshold(user, String(fd.get("threshold") ?? ""));
  revalidatePath("/", "layout");
  go("profiller", r);
}
export async function companyAction(fd: FormData) {
  const user = await requireStaff("shipping.write");
  go("firmalar", await saveCompany(user, fd));
}
export async function methodAction(fd: FormData) {
  const user = await requireStaff("shipping.write");
  go("yontemler", await saveMethod(user, fd));
}
export async function shipmentAction(fd: FormData) {
  const user = await requireStaff("order.update");
  const r = await updateShipment(user, fd);
  const back = String(fd.get("back") || "/admin/kargo?sekme=gonderiler");
  redirect(withMsg(back.startsWith("/admin") ? back : "/admin/kargo?sekme=gonderiler", r.ok ? "ok" : "hata", r.message));
}
