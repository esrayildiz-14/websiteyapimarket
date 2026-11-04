"use server";

import { cookies, headers } from "next/headers";
import { TRACK_COOKIE } from "@/lib/site";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { attemptLogin } from "@/lib/auth/login";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { clientInfo, createSession, destroySession } from "@/lib/auth/session";
import { CUSTOMER_COOKIE, CUSTOMER_SESSION_HOURS, getCurrentCustomer, requireCustomer, safeNext } from "@/lib/auth/customer";
import { normalizePhone } from "@/lib/address";
import { addToCart, removeItem, setQuantity } from "@/server/cart";
import { validateAddress } from "@/server/address-book";
import { placeOrder } from "@/server/checkout";

const msg = (path: string, key: "ok" | "hata", m: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(m)}`;

// ---------------------------------------------------------------- sepet

export async function addToCartAction(fd: FormData) {
  const r = await addToCart(String(fd.get("productId")), String(fd.get("variantId") || "") || null, Number(fd.get("qty") || 1));
  revalidatePath("/", "layout");
  const back = safeNext(fd.get("back"), "/sepet");
  redirect(msg(r.ok && fd.get("go") === "sepet" ? "/sepet" : back, r.ok ? "ok" : "hata", r.message));
}

export async function setQtyAction(fd: FormData) {
  const r = await setQuantity(String(fd.get("itemId")), Number(fd.get("qty")));
  redirect(msg("/sepet", r.ok ? "ok" : "hata", r.message));
}

export async function removeItemAction(fd: FormData) {
  const r = await removeItem(String(fd.get("itemId")));
  redirect(msg("/sepet", r.ok ? "ok" : "hata", r.message));
}

// ---------------------------------------------------------------- üyelik

export type AuthState = { error?: string; errors?: Record<string, string>; values?: Record<string, string> };

export async function customerLoginAction(_p: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "E-posta ve şifre girin.", values: { email } };
  const { ip } = await clientInfo();
  const r = await attemptLogin(email, password, ip, "CUSTOMER");
  if (!r.ok) return { error: r.error, values: { email } };
  // misafir sepeti (çerez) bir sonraki istekte hesaptaki sepete taşınır (currentCart)
  await createSession(r.userId, { cookie: CUSTOMER_COOKIE, hours: CUSTOMER_SESSION_HOURS });
  redirect(safeNext(fd.get("devam")));
}

const registerSchema = z.object({
  firstName: z.string().trim().min(2, "Adınızı girin.").max(60),
  lastName: z.string().trim().min(2, "Soyadınızı girin.").max(60),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").max(200),
  phone: z.string().trim(),
  password: z.string().max(200),
  kvkk: z.literal(true, { errorMap: () => ({ message: "Aydınlatma metnini okuduğunuzu onaylayın." }) }),
  marketing: z.boolean(),
});

export async function registerAction(_p: AuthState, fd: FormData): Promise<AuthState> {
  const values = { firstName: String(fd.get("firstName") ?? ""), lastName: String(fd.get("lastName") ?? ""), email: String(fd.get("email") ?? ""), phone: String(fd.get("phone") ?? "") };
  const parsed = registerSchema.safeParse({ ...values, password: String(fd.get("password") ?? ""), kvkk: fd.get("kvkk") === "on", marketing: fd.get("marketing") === "on" });
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
  const phone = normalizePhone(values.phone);
  if (!phone) errors.phone = "Geçerli bir cep telefonu girin (05xx xxx xx xx).";
  const pw = passwordProblems(String(fd.get("password") ?? ""));
  if (pw) errors.password = pw;
  if (Object.keys(errors).length || !parsed.success) return { error: "Formda düzeltilmesi gereken alanlar var.", errors, values };
  const d = parsed.data;
  if (await prisma.user.findUnique({ where: { email: d.email } })) return { error: "Bu e-posta ile kayıtlı bir hesap var. Giriş yapın.", errors: { email: "Kayıtlı e-posta." }, values };
  const user = await prisma.user.create({
    data: { email: d.email, passwordHash: await hashPassword(d.password), firstName: d.firstName, lastName: d.lastName, phone, type: "CUSTOMER", marketingConsent: d.marketing },
  });
  await createSession(user.id, { cookie: CUSTOMER_COOKIE, hours: CUSTOMER_SESSION_HOURS });
  redirect(safeNext(fd.get("devam")));
}

export async function customerLogoutAction() {
  await destroySession(CUSTOMER_COOKIE);
  redirect("/");
}

// ---------------------------------------------------------------- adres

export async function saveAddressAction(_p: AuthState, fd: FormData): Promise<AuthState> {
  const c = await requireCustomer("/hesabim");
  const raw = Object.fromEntries(["title", "fullName", "phone", "provinceId", "districtId", "neighborhood", "postalCode", "line"].map((k) => [k, String(fd.get(k) ?? "")]));
  const v = await validateAddress(raw);
  if (!v.ok) return { error: "Adreste düzeltilmesi gereken alanlar var.", errors: v.errors, values: raw };
  const count = await prisma.address.count({ where: { userId: c.id, deletedAt: null } });
  if (count >= 20) return { error: "En fazla 20 adres kaydedilebilir.", values: raw };
  const a = v.value;
  await prisma.address.create({
    data: {
      userId: c.id, title: a.title, fullName: a.fullName, phone: a.phone, provinceId: a.provinceId, districtId: a.districtId,
      neighborhood: a.neighborhood, postalCode: a.postalCode, line: a.line, isDefault: count === 0,
    },
  });
  redirect(msg(safeNext(fd.get("devam"), "/hesabim"), "ok", "Adres kaydedildi."));
}

export async function deleteAddressAction(fd: FormData) {
  const c = await requireCustomer("/hesabim");
  await prisma.address.updateMany({ where: { id: String(fd.get("id")), userId: c.id }, data: { deletedAt: new Date(), isDefault: false } });
  redirect(msg("/hesabim", "ok", "Adres silindi."));
}

// ---------------------------------------------------------------- ödeme

export async function placeOrderAction(fd: FormData) {
  const c = await requireCustomer("/odeme");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || `${proto}://${host}`;
  const { ip } = await clientInfo();
  const r = await placeOrder(
    c,
    {
      addressId: String(fd.get("addressId") ?? ""),
      billingAddressId: fd.get("billingSame") === "on" ? null : String(fd.get("billingAddressId") || "") || null,
      shippingMethodId: String(fd.get("shippingMethodId") ?? ""),
      couponCode: String(fd.get("coupon") ?? "").trim() || null,
      acceptedTerms: fd.get("terms") === "on",
      note: String(fd.get("note") ?? "") || null,
    },
    base,
    ip,
  );
  if (!r.ok) redirect(msg(`/odeme?${new URLSearchParams({ kupon: String(fd.get("coupon") ?? "") })}`, "hata", r.message));
  redirect(r.redirect);
}

// ---------------------------------------------------------------- sipariş takip

export async function trackOrderAction(fd: FormData) {
  const no = String(fd.get("no") ?? "").trim().toUpperCase().slice(0, 30);
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const customer = await getCurrentCustomer();
  const order = await prisma.order.findFirst({ where: { orderNumber: no, OR: [{ customerEmail: email }, ...(customer ? [{ userId: customer.id }] : [])] } });
  // sipariş varlığı sızdırılmaz: numara veya e-posta yanlışsa aynı mesaj
  if (!order) redirect(msg("/siparis-takip", "hata", "Sipariş bulunamadı. Sipariş numarası ve e-posta adresini kontrol edin."));
  // E-posta adresi adres çubuğuna / sunucu kayıtlarına yazılmasın: 30 dakikalık, yalnız sunucunun okuyabildiği çerezde tutulur
  (await cookies()).set(TRACK_COOKIE, order.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/siparis-takip", maxAge: 1800 });
  redirect(`/siparis-takip?no=${encodeURIComponent(no)}`);
}

// ---------------------------------------------------------------- şifre sıfırlama

export type ResetState = { error?: string; sent?: boolean };

export async function requestResetAction(_p: ResetState, fd: FormData): Promise<ResetState> {
  const { requestPasswordReset } = await import("@/server/password-reset");
  const { ip } = await clientInfo();
  await requestPasswordReset(String(fd.get("email") ?? ""), ip);
  return { sent: true };
}

export async function resetPasswordAction(_p: ResetState, fd: FormData): Promise<ResetState> {
  const { resetPassword } = await import("@/server/password-reset");
  const r = await resetPassword(String(fd.get("t") ?? ""), String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  if (!r.ok) return { error: r.error };
  redirect("/giris?ok=" + encodeURIComponent("Şifreniz yenilendi. Yeni şifrenizle giriş yapabilirsiniz."));
}

// ---------------------------------------------------------------- hesap bilgileri

export type AccountState = { ok?: string; error?: string; errors?: Record<string, string> };

export async function updateProfileAction(_p: AccountState, fd: FormData): Promise<AccountState> {
  const c = await requireCustomer("/hesabim");
  const firstName = String(fd.get("firstName") ?? "").trim().slice(0, 60);
  const lastName = String(fd.get("lastName") ?? "").trim().slice(0, 60);
  const errors: Record<string, string> = {};
  if (firstName.length < 2) errors.firstName = "Adınızı girin.";
  if (lastName.length < 2) errors.lastName = "Soyadınızı girin.";
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!phone) errors.phone = "Geçerli bir cep telefonu girin (05xx xxx xx xx).";
  if (Object.keys(errors).length) return { error: "Formda düzeltilmesi gereken alanlar var.", errors };
  await prisma.user.update({ where: { id: c.id }, data: { firstName, lastName, phone } });
  revalidatePath("/", "layout");
  return { ok: "Bilgileriniz güncellendi." };
}

/** Şifre değiştirme: mevcut şifre doğrulanır; bu cihaz dışındaki tüm oturumlar kapatılır. */
export async function changeCustomerPasswordAction(_p: AccountState, fd: FormData): Promise<AccountState> {
  const c = await requireCustomer("/hesabim");
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
  const { verifyPassword } = await import("@/lib/auth/password");
  if (!(await verifyPassword(current, u.passwordHash))) return { error: "Mevcut şifre hatalı.", errors: { current: "Mevcut şifre hatalı." } };
  const problem = passwordProblems(next);
  if (problem) return { error: problem, errors: { password: problem } };
  if (next !== confirm) return { error: "Yeni şifreler eşleşmiyor.", errors: { confirm: "Şifreler eşleşmiyor." } };
  if (await verifyPassword(next, u.passwordHash)) return { error: "Yeni şifre eskisiyle aynı olamaz.", errors: { password: "Eski şifreden farklı olmalı." } };
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  const { sha256 } = await import("@/lib/auth/session");
  await prisma.$transaction([
    prisma.user.update({ where: { id: c.id }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.deleteMany({ where: { userId: c.id, ...(token ? { NOT: { tokenHash: sha256(token) } } : {}) } }),
    prisma.passwordResetToken.updateMany({ where: { userId: c.id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  return { ok: "Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı." };
}
