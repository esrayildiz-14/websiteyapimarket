"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { attemptLogin } from "@/lib/auth/login";
import { clientInfo, createSession, destroySession, getPendingMfaSession } from "@/lib/auth/session";
import { verifyLoginCode } from "@/server/mfa";

export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "E-posta ve şifre girin.", email };
  const { ip } = await clientInfo();
  const result = await attemptLogin(email, password, ip);
  if (!result.ok) return { error: result.error, email };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId }, select: { totpEnabledAt: true } });
  if (user.totpEnabledAt) {
    // Şifre doğru; kod doğrulanana kadar yetkisiz, 10 dakikalık bekleyen oturum
    await createSession(result.userId, { mfaPending: true, hours: 1 / 6 });
    redirect("/admin/giris/dogrula");
  }
  await createSession(result.userId);
  redirect("/admin");
}

export type MfaState = { error?: string };

export async function verifyMfaAction(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const pending = await getPendingMfaSession();
  if (!pending) redirect("/admin/giris");
  const r = await verifyLoginCode(pending.id, pending.userId, String(fd.get("code") ?? "").slice(0, 10));
  if (r === "locked") {
    await destroySession();
    redirect("/admin/giris?hata=" + encodeURIComponent("Çok fazla hatalı kod. Yeniden giriş yapın."));
  }
  if (r === "wrong") return { error: "Kod hatalı veya süresi geçmiş. Uygulamadaki güncel kodu girin." };
  // Doğrulandı: bekleyen oturum silinir, yeni (tam yetkili) oturum açılır
  await prisma.session.delete({ where: { id: pending.id } });
  await createSession(pending.userId);
  await prisma.loginAttempt.create({ data: { email: pending.user.email, ipAddress: pending.ipAddress ?? "yerel", success: true } });
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/giris");
}
