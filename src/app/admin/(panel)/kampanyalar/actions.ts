"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { saveCoupon, saveDiscount } from "@/server/campaigns-admin";

export async function discountAction(fd: FormData) {
  const user = await requireStaff("campaign.write");
  const r = await saveDiscount(user, fd);
  revalidatePath("/", "layout");
  redirect(withMsg("/admin/kampanyalar", r.ok ? "ok" : "hata", r.message));
}
export async function couponAction(fd: FormData) {
  const user = await requireStaff("campaign.write");
  const r = await saveCoupon(user, fd);
  redirect(withMsg("/admin/kampanyalar?sekme=kupon", r.ok ? "ok" : "hata", r.message));
}
