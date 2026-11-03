"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireStaff, sha256 } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { confirmMfaSetup, disableMfa, startMfaSetup } from "@/server/mfa";

const BACK = "/admin/guvenlik";

export async function startMfaAction() {
  const user = await requireStaff(undefined, { allowWithoutMfa: true });
  await startMfaSetup(user.id);
  redirect(BACK);
}

export async function confirmMfaAction(fd: FormData) {
  const user = await requireStaff(undefined, { allowWithoutMfa: true });
  const token = (await cookies()).get("oy_admin")?.value ?? null;
  const r = await confirmMfaSetup(user.id, String(fd.get("code") ?? ""), token ? sha256(token) : null);
  redirect(withMsg(BACK, r.ok ? "ok" : "hata", r.message));
}

export async function disableMfaAction(fd: FormData) {
  const user = await requireStaff(undefined, { allowWithoutMfa: true });
  const r = await disableMfa(user.id, String(fd.get("password") ?? ""), String(fd.get("code") ?? ""));
  redirect(withMsg(BACK, r.ok ? "ok" : "hata", r.message));
}
