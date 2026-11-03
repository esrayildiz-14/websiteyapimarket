"use server";

import { headers } from "next/headers";
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
  redirect(`/siparis-takip?no=${encodeURIComponent(no)}&e=${encodeURIComponent(email)}`);
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
