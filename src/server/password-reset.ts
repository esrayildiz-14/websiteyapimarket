import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { siteUrl } from "@/lib/site";
import { sendEmail } from "./email";

export const RESET_MINUTES = 30;
export const MAX_RESETS_PER_HOUR = 3;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Şifre sıfırlama bağlantısı ister. Hesap var mı yok mu dışarıdan anlaşılmaz: her durumda aynı yanıt.
 * Yalnız etkin müşteri hesapları için; saatte en fazla 3 bağlantı.
 */
export async function requestPasswordReset(emailRaw: string, ip: string) {
  const email = emailRaw.trim().toLowerCase().slice(0, 200);
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || user.type !== "CUSTOMER" || !user.isActive || user.deletedAt) return;
  const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= MAX_RESETS_PER_HOUR) return;
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000), ipAddress: ip },
  });
  const link = `${siteUrl()}/sifre-yenile?t=${token}`;
  await sendEmail({
    to: user.email,
    secret: link,
    template: "password.reset",
    subject: "Şifre sıfırlama bağlantınız",
    body: [
      `Merhaba ${user.firstName},`,
      "",
      `Şifrenizi yenilemek için ${RESET_MINUTES} dakika içinde şu bağlantıyı açın:`,
      link,
      "",
      "Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmez.",
    ].join("\n"),
  });
}

async function validToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!t || t.usedAt || t.expiresAt.getTime() < Date.now() || !t.user.isActive || t.user.deletedAt) return null;
  return t;
}

export async function resetTokenUsable(token: string) {
  return !!(await validToken(token));
}

/** Yeni şifreyi kaydeder; bağlantı tek kullanımlıktır. Kullanıcının tüm oturumları ve diğer bağlantıları geçersiz olur. */
export async function resetPassword(token: string, password: string, confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await validToken(token);
  if (!t) return { ok: false, error: "Bağlantı geçersiz veya süresi dolmuş. Yeni bir sıfırlama bağlantısı isteyin." };
  const problem = passwordProblems(password);
  if (problem) return { ok: false, error: problem };
  if (password !== confirm) return { ok: false, error: "Şifreler eşleşmiyor." };
  const hash = await hashPassword(password);
  const used = await prisma.$transaction(async (tx) => {
    const mark = await tx.passwordResetToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
    if (mark.count !== 1) return false; // aynı bağlantı aynı anda iki kez kullanılamaz
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash: hash } });
    await tx.passwordResetToken.updateMany({ where: { userId: t.userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: t.userId } });
    return true;
  });
  if (!used) return { ok: false, error: "Bağlantı zaten kullanılmış." };
  await audit(t.userId, "password.reset", "User", t.userId);
  return { ok: true };
}
