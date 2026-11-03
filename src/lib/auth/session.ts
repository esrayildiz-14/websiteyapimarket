import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Permission } from "./permissions";

export const SESSION_COOKIE = "oy_admin";
const SESSION_HOURS = 8;
const IDLE_MINUTES = 30;

import { clientIpFrom } from "@/lib/rate-limit";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function clientInfo() {
  const h = await headers();
  const ip = clientIpFrom((n) => h.get(n));
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

/** Yalnız server action / route handler içinden çağrılır (çerez yazar). */
export async function createSession(userId: string, opts: { cookie?: string; hours?: number } = {}) {
  const token = randomBytes(32).toString("base64url");
  const { ip, userAgent } = await clientInfo();
  const expiresAt = new Date(Date.now() + (opts.hours ?? SESSION_HOURS) * 3600_000);
  await prisma.session.create({ data: { userId, tokenHash: sha256(token), expiresAt, ipAddress: ip, userAgent } });
  (await cookies()).set(opts.cookie ?? SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(cookie = SESSION_COOKIE) {
  const jar = await cookies();
  const token = jar.get(cookie)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(cookie);
}

export { sha256 };

export type StaffUser = {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  permissions: Set<string>;
};

/** Geçerli admin oturumu (istek başına bir kez sorgulanır) */
export const getCurrentStaff = cache(async (): Promise<StaffUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!session) return null;
  const now = Date.now();
  const idle = now - session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000;
  const u = session.user;
  if (session.expiresAt.getTime() < now || idle || !u.isActive || u.deletedAt || u.type !== "STAFF" || !u.role) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const all = u.role.key === "SUPER_ADMIN";
  return {
    id: u.id,
    email: u.email,
    name: `${u.firstName} ${u.lastName}`,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: new Set(all ? ["*"] : u.role.permissions.map((rp) => rp.permission.key)),
  };
});

export function can(user: StaffUser | null, permission: Permission) {
  return !!user && (user.permissions.has("*") || user.permissions.has(permission));
}

/** Sayfa ve action'ların başında: oturum yoksa girişe, yetki yoksa panoya yönlendirir. */
export async function requireStaff(permission?: Permission): Promise<StaffUser> {
  const user = await getCurrentStaff();
  if (!user) redirect("/admin/giris");
  if (permission && !can(user, permission)) redirect("/admin?hata=" + encodeURIComponent("Bu işlem için yetkiniz yok."));
  return user;
}
