import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { hashPassword, passwordProblems } from "@/lib/auth/password";

export type Result = { ok: true; message: string } | { ok: false; message: string; errors?: Record<string, string> };

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").max(200),
  firstName: z.string().trim().min(2, "Adı girin.").max(60),
  lastName: z.string().trim().min(2, "Soyadı girin.").max(60),
  roleId: z.string().min(1, "Rol seçin."),
  password: z.string(),
});

/** Personel hesabı açar. Geçici şifreyi yönetici belirler ve personele güvenli bir kanaldan iletir. */
export async function createStaff(user: StaffUser, raw: Record<string, unknown>): Promise<Result> {
  const p = createSchema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!p.success) for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message;
  const pw = passwordProblems(String(raw.password ?? ""));
  if (pw) errors.password = pw;
  if (!p.success || Object.keys(errors).length) return { ok: false, message: "Formdaki hataları düzeltin.", errors };
  const role = await prisma.role.findUnique({ where: { id: p.data.roleId } });
  if (!role) return { ok: false, message: "Rol bulunamadı.", errors: { roleId: "Rol bulunamadı." } };
  if (role.key === "SUPER_ADMIN" && !user.permissions.has("*")) return { ok: false, message: "Super Admin rolünü yalnız Super Admin verebilir." };
  if (await prisma.user.findUnique({ where: { email: p.data.email } })) return { ok: false, message: "Bu e-posta ile bir hesap var.", errors: { email: "Kayıtlı e-posta." } };
  const u = await prisma.user.create({
    data: { email: p.data.email, firstName: p.data.firstName, lastName: p.data.lastName, type: "STAFF", roleId: role.id, passwordHash: await hashPassword(p.data.password) },
  });
  await audit(user.id, "staff.create", "User", u.id, undefined, { email: u.email, role: role.key });
  return { ok: true, message: `${u.firstName} ${u.lastName} eklendi (${role.name}).` };
}

async function superAdminCount() {
  return prisma.user.count({ where: { type: "STAFF", isActive: true, deletedAt: null, role: { key: "SUPER_ADMIN" } } });
}

/** Rol değişikliği / pasife alma. Kendi hesabını kapatma ve son Super Admin'i kaldırma engellenir. Değişiklikte oturumlar kapatılır. */
export async function updateStaff(user: StaffUser, id: string, roleId: string, isActive: boolean): Promise<Result> {
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target || target.type !== "STAFF") return { ok: false, message: "Personel bulunamadı." };
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { ok: false, message: "Rol bulunamadı." };
  if (id === user.id && (!isActive || role.id !== target.roleId)) return { ok: false, message: "Kendi rolünüzü değiştiremez veya hesabınızı pasife alamazsınız." };
  if ((role.key === "SUPER_ADMIN" || target.role?.key === "SUPER_ADMIN") && !user.permissions.has("*"))
    return { ok: false, message: "Super Admin hesaplarını yalnız Super Admin değiştirebilir." };
  if (target.role?.key === "SUPER_ADMIN" && (role.key !== "SUPER_ADMIN" || !isActive) && (await superAdminCount()) <= 1)
    return { ok: false, message: "Son etkin Super Admin kaldırılamaz." };
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { roleId: role.id, isActive } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit(user.id, "staff.update", "User", id, { role: target.role?.key, isActive: target.isActive }, { role: role.key, isActive });
  return { ok: true, message: `${target.firstName} ${target.lastName} güncellendi; açık oturumları kapatıldı.` };
}

/** Kaybolan telefon vb. için personelin iki adımlı doğrulamasını sıfırlar. */
export async function resetStaffMfa(user: StaffUser, id: string): Promise<Result> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.type !== "STAFF") return { ok: false, message: "Personel bulunamadı." };
  if (id === user.id) return { ok: false, message: "Kendi iki adımlı doğrulamanızı Hesap güvenliği sayfasından yönetin." };
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  await audit(user.id, "staff.mfa.reset", "User", id);
  return { ok: true, message: "İki adımlı doğrulama sıfırlandı; personel bir sonraki girişte yeniden kurmalı." };
}
