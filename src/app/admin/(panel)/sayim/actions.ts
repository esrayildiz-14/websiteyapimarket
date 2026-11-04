"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { approveCount, cancelCount, removeLine, reopenCount, scan, startCount, submitCount, type ScanResult } from "@/server/stock-count";

const back = (id: string, r: { ok: boolean; message: string }) => redirect(withMsg(`/admin/sayim/${id}`, r.ok ? "ok" : "hata", r.message));

export async function startCountAction(fd: FormData) {
  const user = await requireStaff("stockcount.write");
  const r = await startCount(user, String(fd.get("warehouseId") ?? ""), String(fd.get("note") ?? ""));
  if (!r.ok) redirect(withMsg("/admin/sayim", "hata", r.message));
  redirect(withMsg(`/admin/sayim/${r.id}`, "ok", r.message));
}

export async function scanAction(_p: ScanResult | null, fd: FormData): Promise<ScanResult> {
  const user = await requireStaff("stockcount.write");
  const id = String(fd.get("countId"));
  const r = await scan(user, id, { code: fd.get("code"), quantity: fd.get("quantity") || "1", mode: fd.get("mode") || "add" });
  revalidatePath(`/admin/sayim/${id}`);
  return r;
}

export async function removeLineAction(fd: FormData) {
  const user = await requireStaff("stockcount.write");
  const id = String(fd.get("countId"));
  back(id, await removeLine(user, id, String(fd.get("lineId"))));
}

export async function submitCountAction(fd: FormData) {
  const user = await requireStaff("stockcount.write");
  const id = String(fd.get("countId"));
  back(id, await submitCount(user, id, fd.get("fullCount") === "on"));
}

export async function reopenCountAction(fd: FormData) {
  const user = await requireStaff("stockcount.write");
  const id = String(fd.get("countId"));
  back(id, await reopenCount(user, id));
}

export async function cancelCountAction(fd: FormData) {
  const user = await requireStaff("stockcount.write");
  const id = String(fd.get("countId"));
  back(id, await cancelCount(user, id));
}

export async function approveCountAction(fd: FormData) {
  const user = await requireStaff("stockcount.approve");
  const id = String(fd.get("countId"));
  const r = await approveCount(user, id);
  revalidatePath("/", "layout");
  back(id, r);
}
