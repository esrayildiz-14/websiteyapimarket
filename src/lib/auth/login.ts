import "server-only";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "./password";

const WINDOW_MIN = 15;
export const MAX_FAILS_PER_EMAIL = 5;
export const MAX_FAILS_PER_IP = 20;

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; locked?: boolean };

/** E-posta + şifre doğrulaması; başarısız denemeleri sayar ve geçici kilit uygular. */
export async function attemptLogin(emailRaw: string, password: string, ip: string, userType: "STAFF" | "CUSTOMER" = "STAFF"): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ipAddress: ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= MAX_FAILS_PER_EMAIL || byIp >= MAX_FAILS_PER_IP) {
    return { ok: false, locked: true, error: `Çok fazla hatalı deneme. ${WINDOW_MIN} dakika sonra tekrar deneyin.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(password, user?.passwordHash);
  const allowed = !!user && passwordOk && user.type === userType && user.isActive && !user.deletedAt;

  await prisma.loginAttempt.create({ data: { email, ipAddress: ip, success: allowed } });
  if (!allowed) return { ok: false, error: "E-posta veya şifre hatalı." };

  await prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, userId: user!.id };
}
