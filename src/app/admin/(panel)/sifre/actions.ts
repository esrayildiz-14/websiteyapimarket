"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { createSession, requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import type { FormState } from "@/components/admin/ActionForm";

/** Yönetici kendi şifresini değiştirir. Başarılı olursa diğer bütün oturumları kapanır. */
export async function changePasswordAction(_p: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const again = String(fd.get("again") ?? "");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
  if (!(await verifyPassword(current, user.passwordHash))) return { message: "Şifre değiştirilemedi.", errors: { current: "Mevcut şifre hatalı." } };
  const problem = passwordProblems(next);
  if (problem) return { message: "Şifre değiştirilemedi.", errors: { next: problem } };
  if (next !== again) return { message: "Şifre değiştirilemedi.", errors: { again: "Yeni şifreler aynı değil." } };
  if (next === current) return { message: "Şifre değiştirilemedi.", errors: { next: "Yeni şifre eskisiyle aynı olamaz." } };
  await prisma.$transaction([
    prisma.user.update({ where: { id: staff.id }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.deleteMany({ where: { userId: staff.id } }),
  ]);
  await createSession(staff.id);
  await audit(staff.id, "user.password", "User", staff.id, undefined, { changed: true });
  redirect(withMsg("/admin", "ok", "Şifreniz değiştirildi. Diğer cihazlardaki oturumlarınız kapatıldı."));
}
