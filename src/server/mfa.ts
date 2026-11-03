import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { newSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { open, seal } from "@/lib/secret-box";
import { verifyPassword } from "@/lib/auth/password";

export const MAX_MFA_FAILS = 5;
type R = { ok: true; message: string } | { ok: false; message: string };

/** Kurulum: yeni anahtar üretir (henüz etkin değil). Ekranda gösterilecek anahtar ve otpauth adresi döner. */
export async function startMfaSetup(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.totpEnabledAt) return null;
  const secret = newSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpPendingSecret: seal(secret) } });
  return { secret, uri: otpauthUri(secret, u.email) };
}

/** Kurulumdaki anahtarı gösterir (sayfa yenilenince aynı anahtar). */
export async function pendingSetup(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.totpEnabledAt || !u.totpPendingSecret) return null;
  const secret = open(u.totpPendingSecret);
  return { secret, uri: otpauthUri(secret, u.email) };
}

/** İlk kod doğrulanınca 2FA etkinleşir; bu oturum dışındaki tüm oturumlar kapatılır. */
export async function confirmMfaSetup(userId: string, code: string, keepSessionHash: string | null): Promise<R> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.totpEnabledAt) return { ok: false, message: "İki adımlı doğrulama zaten etkin." };
  if (!u.totpPendingSecret) return { ok: false, message: "Önce kurulumu başlatın." };
  const step = verifyTotp(open(u.totpPendingSecret), code);
  if (step === null) return { ok: false, message: "Kod doğrulanamadı. Uygulamadaki güncel 6 haneli kodu girin." };
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { totpSecret: u.totpPendingSecret, totpPendingSecret: null, totpEnabledAt: new Date(), totpLastStep: step },
    }),
    prisma.session.deleteMany({ where: { userId, ...(keepSessionHash ? { NOT: { tokenHash: keepSessionHash } } : {}) } }),
  ]);
  await audit(userId, "mfa.enable", "User", userId);
  return { ok: true, message: "İki adımlı doğrulama etkinleştirildi. Diğer cihazlardaki oturumlar kapatıldı." };
}

/** Kapatma: şifre + güncel kod gerekir. */
export async function disableMfa(userId: string, password: string, code: string): Promise<R> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.totpEnabledAt || !u.totpSecret) return { ok: false, message: "İki adımlı doğrulama zaten kapalı." };
  if (!(await verifyPassword(password, u.passwordHash))) return { ok: false, message: "Şifre hatalı." };
  const step = verifyTotp(open(u.totpSecret), code, Date.now(), u.totpLastStep);
  if (step === null) return { ok: false, message: "Kod doğrulanamadı." };
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null } });
  await audit(userId, "mfa.disable", "User", userId);
  return { ok: true, message: "İki adımlı doğrulama kapatıldı." };
}

/**
 * Girişte kod doğrulaması. Başarılıysa true; aynı kod ikinci kez kabul edilmez.
 * 5 hatalı denemede bekleyen oturum silinir (yeniden şifreyle giriş gerekir).
 */
export async function verifyLoginCode(sessionId: string, userId: string, code: string): Promise<"ok" | "wrong" | "locked"> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.totpSecret) return "wrong";
  const step = verifyTotp(open(u.totpSecret), code, Date.now(), u.totpLastStep);
  if (step === null) {
    const s = await prisma.session.update({ where: { id: sessionId }, data: { mfaFails: { increment: 1 } } });
    await prisma.loginAttempt.create({ data: { email: u.email, ipAddress: s.ipAddress ?? "yerel", success: false } });
    if (s.mfaFails >= MAX_MFA_FAILS) {
      await prisma.session.delete({ where: { id: sessionId } });
      return "locked";
    }
    return "wrong";
  }
  // aynı adımı iki istek aynı anda kullanamasın: koşullu güncelleme
  const updated = await prisma.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return updated.count === 1 ? "ok" : "wrong";
}
