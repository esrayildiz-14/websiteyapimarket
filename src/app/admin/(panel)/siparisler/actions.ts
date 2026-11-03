"use server";

import { redirect } from "next/navigation";
import type { OrderStatus } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { changeOrderStatus, saveAdminNote } from "@/server/orders-admin";

export async function orderStatusAction(fd: FormData) {
  const to = String(fd.get("status")) as OrderStatus;
  const user = await requireStaff(to === "CANCELLED" || to === "REFUNDED" ? "order.refund" : "order.update");
  const id = String(fd.get("id"));
  const r = await changeOrderStatus(user, id, to, String(fd.get("note") ?? "").trim().slice(0, 300) || null, fd.get("restock") === "on");
  redirect(withMsg(`/admin/siparisler/${id}`, r.ok ? "ok" : "hata", r.message));
}

export async function orderNoteAction(fd: FormData) {
  const user = await requireStaff("order.update");
  const id = String(fd.get("id"));
  const r = await saveAdminNote(user, id, String(fd.get("adminNote") ?? ""));
  redirect(withMsg(`/admin/siparisler/${id}`, "ok", r.message));
}
