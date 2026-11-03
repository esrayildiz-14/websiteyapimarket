import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { sha256 } from "./session";

/** Müşteri oturumu: admin oturumundan ayrı çerez (oy_sid), 30 gün. */
export const CUSTOMER_COOKIE = "oy_sid";
export const CUSTOMER_SESSION_HOURS = 24 * 30;

export type Customer = { id: string; email: string; firstName: string; lastName: string; phone: string | null; createdAt: Date; lastLoginAt: Date | null };

export const getCurrentCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s) return null;
  const u = s.user;
  if (s.expiresAt.getTime() < Date.now() || u.type !== "CUSTOMER" || !u.isActive || u.deletedAt) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => undefined);
    return null;
  }
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt };
});

export async function requireCustomer(next: string): Promise<Customer> {
  const c = await getCurrentCustomer();
  if (!c) redirect(`/giris?devam=${encodeURIComponent(next)}`);
  return c;
}

/** Yönlendirme hedefi yalnız site içi göreli yol olabilir (açık yönlendirme engeli). */
export function safeNext(v: unknown, fallback = "/hesabim") {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
