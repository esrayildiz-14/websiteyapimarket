"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import type { FormState } from "@/components/admin/ActionForm";
import { createStaff, resetStaffMfa, updateStaff } from "@/server/staff-admin";

export async function createStaffAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireStaff("user.manage");
  const r = await createStaff(user, Object.fromEntries(fd.entries()));
  if (!r.ok) return { message: r.message, errors: r.errors };
  redirect(withMsg("/admin/personel", "ok", r.message));
}

export async function updateStaffAction(fd: FormData) {
  const user = await requireStaff("user.manage");
  const r = await updateStaff(user, String(fd.get("id")), String(fd.get("roleId")), fd.get("isActive") === "on");
  redirect(withMsg("/admin/personel", r.ok ? "ok" : "hata", r.message));
}

export async function resetMfaAction(fd: FormData) {
  const user = await requireStaff("user.manage");
  const r = await resetStaffMfa(user, String(fd.get("id")));
  redirect(withMsg("/admin/personel", r.ok ? "ok" : "hata", r.message));
}
