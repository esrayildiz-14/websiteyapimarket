"use server";

import { redirect } from "next/navigation";
import { attemptLogin } from "@/lib/auth/login";
import { clientInfo, createSession, destroySession } from "@/lib/auth/session";

export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "E-posta ve şifre girin.", email };
  const { ip } = await clientInfo();
  const result = await attemptLogin(email, password, ip);
  if (!result.ok) return { error: result.error, email };
  await createSession(result.userId);
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/giris");
}
