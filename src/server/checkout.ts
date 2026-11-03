import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Customer } from "@/lib/auth/customer";
import { formatTL, round2 } from "@/lib/money";
import type { ShippingPackage } from "@/lib/shipping";
import { cartView } from "./cart";
import { commitSale, release, reserve, StockError } from "./inventory";
import { sendEmail } from "./email";
import { paymentProvider } from "./payments";
import { iyzicoConfig, initializeCheckoutForm, retrieveCheckoutForm } from "./payments/iyzico";
import type { AddressSnapshot } from "./address-book";

/** Ödeme bekleyen siparişte stok ayırmasının süresi */
export const RESERVATION_MINUTES = 30;

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `OY${ymd}${randomInt(100000, 999999)}`;
}

function snapshotOf(a: { fullName: string; phone: string; neighborhood: string; postalCode: string; line: string; provinceId: number; districtId: number; province: { name: string }; district: { name: string } }): AddressSnapshot {
  return {
    fullName: a.fullName, phone: a.phone, province: a.province.name, provinceId: a.provinceId, district: a.district.name,
    districtId: a.districtId, neighborhood: a.neighborhood, postalCode: a.postalCode, line: a.line,
  };
}

export type PlaceResult = { ok: true; redirect: string } | { ok: false; message: string };

/**
 * Siparişi oluşturur ve ödeme sayfasına yönlendirme adresini döndürür.
 * Sipariş "ödeme bekliyor" (PENDING_PAYMENT) durumunda başlar; stok ayrılır ama düşülmez.
 * Ödeme sağlayıcıdan sunucu tarafında doğrulanmadan sipariş asla "ödendi" olmaz.
 */
export async function placeOrder(
  customer: Customer,
  input: { addressId: string; billingAddressId?: string | null; shippingMethodId: string; couponCode?: string | null; acceptedTerms: boolean; note?: string | null },
  baseUrl: string,
  clientIp: string,
): Promise<PlaceResult> {
  await expireStaleOrders();
  if (!input.acceptedTerms) return { ok: false, message: "Ön bilgilendirme formu ve mesafeli satış sözleşmesini onaylamanız gerekir." };
  const provider = paymentProvider();
  if (!provider) return { ok: false, message: "Ödeme altyapısı henüz yapılandırılmadı. Şu an ödeme alınamıyor; siparişiniz oluşturulmadı." };

  const [addr, billing, method] = await Promise.all([
    prisma.address.findFirst({ where: { id: input.addressId, userId: customer.id, deletedAt: null }, include: { province: true, district: true } }),
    input.billingAddressId
      ? prisma.address.findFirst({ where: { id: input.billingAddressId, userId: customer.id, deletedAt: null }, include: { province: true, district: true } })
      : null,
    prisma.shippingMethod.findFirst({ where: { id: input.shippingMethodId, isActive: true } }),
  ]);
  if (!addr) return { ok: false, message: "Teslimat adresi seçin." };
  if (input.billingAddressId && !billing) return { ok: false, message: "Fatura adresi bulunamadı." };
  if (!method) return { ok: false, message: "Teslimat yöntemi seçin." };

  const view = await cartView({ couponCode: input.couponCode, shippingMethodId: method.id, userId: customer.id });
  if (!view.lines.length) return { ok: false, message: "Sepetiniz boş." };
  if (view.hasProblems) return { ok: false, message: "Sepetinizde stokta olmayan veya satıştan kalkan ürün var. Lütfen sepeti kontrol edin." };
  if (input.couponCode && !view.coupon?.ok) return { ok: false, message: view.coupon && !view.coupon.ok ? view.coupon.message : "Kupon geçersiz." };

  const ship = snapshotOf(addr);
  const bill = billing ? snapshotOf(billing) : ship;
  const conversationId = randomBytes(12).toString("hex");
  const ratio = view.subtotal > 0 ? view.merchandise / view.subtotal : 0;

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      for (const l of view.okLines) await reserve(tx, { productId: l.productId, variantId: l.variantId }, l.quantity);
      let number = orderNumber();
      while (await tx.order.findUnique({ where: { orderNumber: number } })) number = orderNumber();
      const o = await tx.order.create({
        data: {
          orderNumber: number,
          userId: customer.id,
          status: "PENDING_PAYMENT",
          paymentMethod: "CARD",
          customerName: `${customer.firstName} ${customer.lastName}`,
          customerEmail: customer.email,
          customerPhone: addr.phone,
          shippingAddress: ship,
          billingAddress: bill,
          subtotal: view.subtotal,
          discountTotal: view.couponDiscount,
          shippingTotal: view.shipping.total,
          vatTotal: view.vatTotal,
          grandTotal: view.grandTotal,
          couponCode: view.coupon?.ok ? view.coupon.code : null,
          shippingMethodId: method.id,
          shippingBreakdown: { packages: view.shipping.packages, methodFee: view.shipping.methodFee, thresholdMet: view.shipping.thresholdMet },
          reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60_000),
          customerNote: input.note?.slice(0, 500) || null,
          items: {
            create: view.okLines.map((l) => ({
              productId: l.productId, variantId: l.variantId, variantName: l.variantName, productName: l.name, sku: l.sku,
              unitPrice: l.unitPrice, vatRate: l.vatRate, quantity: l.quantity, lineTotal: l.lineTotal, shippingProfileCode: l.profileCode,
            })),
          },
          statusHistory: { create: { toStatus: "PENDING_PAYMENT", note: "Sipariş oluşturuldu, ödeme bekleniyor" } },
          payments: { create: { provider: provider === "iyzico" ? "IYZICO" : "TEST", amount: view.grandTotal, conversationId, isTest: provider === "test" || !!iyzicoConfig()?.isTest } },
        },
        include: { payments: true, items: true },
      });
      return o;
    });
  } catch (e) {
    if (e instanceof StockError) return { ok: false, message: "Bu arada bazı ürünlerin stoğu değişti. Lütfen sepetinizi kontrol edin." };
    throw e;
  }
  const payment = order.payments[0];

  if (provider === "test") {
    const token = "test_" + randomBytes(16).toString("hex");
    await prisma.payment.update({ where: { id: payment.id }, data: { providerToken: token } });
    return { ok: true, redirect: `/odeme/test-saglayici?token=${token}` };
  }

  // iyzico: sepet kalemleri toplamı = ödenecek tutar olmalı. Kupon indirimi satırlara oranlanır, kargo ayrı kalemdir.
  const items = order.items.map((i) => ({ id: i.id, name: i.productName.slice(0, 100), category1: "Yapı Market", itemType: "PHYSICAL" as const, price: round2(Number(i.lineTotal) * ratio) }));
  if (view.shipping.total > 0) items.push({ id: "KARGO", name: "Kargo", category1: "Kargo", itemType: "PHYSICAL", price: view.shipping.total });
  const diff = round2(view.grandTotal - items.reduce((s, i) => s + i.price, 0));
  if (diff !== 0) items[0].price = round2(items[0].price + diff); // kuruş yuvarlama farkı
  const addrOf = (a: AddressSnapshot) => ({ contactName: a.fullName, city: a.province, country: "Turkey", address: `${a.neighborhood} ${a.line} ${a.district}/${a.province}`, zipCode: a.postalCode });
  const init = await initializeCheckoutForm({
    conversationId,
    basketId: order.id,
    price: view.grandTotal,
    callbackUrl: `${baseUrl}/api/odeme/iyzico`,
    buyer: {
      id: customer.id, name: customer.firstName, surname: customer.lastName, gsmNumber: "+9" + addr.phone, email: customer.email,
      // VARSAYIM (ASM-PAY-01): T.C. kimlik no toplanmıyor; iyzico'nun zorunlu alanı için test değeri gönderilir.
      // Canlıya geçmeden önce iyzico ve mali müşavir ile doğrulanmalıdır.
      identityNumber: "11111111111",
      registrationAddress: addrOf(ship).address, ip: clientIp, city: ship.province, country: "Turkey", zipCode: ship.postalCode,
    },
    shippingAddress: addrOf(ship),
    billingAddress: addrOf(bill),
    basketItems: items.map((i) => ({ ...i, price: String(i.price) })),
  }).catch((e: Error) => ({ status: "failure", errorMessage: e.message, token: undefined, paymentPageUrl: undefined, errorCode: "NETWORK" }));

  if (init.status !== "success" || !init.paymentPageUrl || !init.token) {
    await finalizePayment(payment.id, { success: false, errorCode: init.errorCode ?? null, errorMessage: init.errorMessage ?? "Ödeme formu başlatılamadı.", raw: init });
    return { ok: false, message: `Ödeme sayfası açılamadı: ${init.errorMessage ?? "bilinmeyen hata"}. Siparişiniz iptal edildi, kartınızdan çekim yapılmadı.` };
  }
  await prisma.payment.update({ where: { id: payment.id }, data: { providerToken: init.token } });
  return { ok: true, redirect: init.paymentPageUrl };
}

type Outcome = { success: boolean; providerPaymentId?: string | null; paidPrice?: number; errorCode?: string | null; errorMessage?: string | null; raw?: unknown };

/**
 * Ödeme sonucunu işler. Aynı ödeme için birden fazla çağrılsa da yalnız ilk sonuç uygulanır (idempotent).
 * Başarılıysa: tutar doğrulanır → stok düşülür → sipariş PAID → gönderiler oluşturulur → onay e-postası.
 * Başarısızsa: stok ayırması bırakılır → sipariş CANCELLED. Hiçbir durumda doğrulanmamış ödeme "ödendi" sayılmaz.
 */
export async function finalizePayment(paymentId: string, outcome: Outcome) {
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM payments WHERE id = ${paymentId} FOR UPDATE`;
    if (!locked.length) return { kind: "missing" as const };
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { include: { items: true } } } });
    const order = payment.order;
    if (payment.status !== "PENDING") return { kind: "already" as const, order };

    const now = new Date();
    const amountOk = outcome.paidPrice === undefined || Math.abs(outcome.paidPrice - Number(order.grandTotal)) < 0.005;
    if (outcome.success && !amountOk) outcome = { ...outcome, success: false, errorMessage: "Ödenen tutar sipariş tutarıyla uyuşmuyor." };

    if (outcome.success) {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "SUCCESS", providerPaymentId: outcome.providerPaymentId ?? null, completedAt: now, rawResponse: (outcome.raw ?? undefined) as never },
      });
      if (order.status !== "PENDING_PAYMENT") {
        // ödeme, sipariş süresi dolup iptal edildikten sonra geldi: stok yeniden ayrılamazsa iade gerekir
        await tx.order.update({ where: { id: order.id }, data: { adminNote: `${now.toISOString()}: Ödeme, sipariş iptal edildikten sonra alındı. İade veya manuel işlem gerekli.` } });
        return { kind: "late" as const, order };
      }
      for (const i of order.items) {
        if (!i.productId) continue;
        await commitSale(tx, { productId: i.productId, variantId: i.variantId }, i.quantity, { orderId: order.id, note: `Satış ${order.orderNumber}` });
      }
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: now, reservationExpiresAt: null } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: payment.isTest ? "Ödeme alındı (TEST sağlayıcı — gerçek tahsilat yok)" : "Ödeme alındı (iyzico)" } });
      const pk = ((order.shippingBreakdown as { packages?: ShippingPackage[] } | null)?.packages ?? []) as ShippingPackage[];
      for (const p of pk) await tx.shipment.create({ data: { orderId: order.id, profileCode: p.profile, description: p.description, chargedFee: p.fee, events: { create: { status: "PREPARING", note: "Ödeme alındı" } } } });
      if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode }, data: { usedCount: { increment: 1 } } });
      if (order.userId) await tx.cartItem.deleteMany({ where: { cart: { userId: order.userId } } });
      return { kind: "paid" as const, order };
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED", errorCode: outcome.errorCode ?? null, errorMessage: outcome.errorMessage ?? null, completedAt: now, rawResponse: (outcome.raw ?? undefined) as never },
    });
    if (order.status === "PENDING_PAYMENT") {
      for (const i of order.items) if (i.productId) await release(tx, { productId: i.productId, variantId: i.variantId }, i.quantity);
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: now, reservationExpiresAt: null } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "CANCELLED", note: `Ödeme başarısız: ${outcome.errorMessage ?? "—"}` } });
    }
    return { kind: "failed" as const, order };
  });

  if (result.kind === "paid") {
    const o = result.order;
    await sendEmail({
      to: o.customerEmail,
      subject: `Siparişiniz alındı — ${o.orderNumber}`,
      template: "order.paid",
      orderId: o.id,
      body:
        `Merhaba ${o.customerName},\n\n${o.orderNumber} numaralı siparişiniz için ödemeniz alındı.\n\n` +
        o.items.map((i) => `• ${i.productName} × ${i.quantity} — ${formatTL(i.lineTotal)}`).join("\n") +
        `\n\nKargo: ${formatTL(o.shippingTotal)}\nToplam: ${formatTL(o.grandTotal)}\n\nSiparişiniz kargoya verildiğinde ayrıca bilgilendirileceksiniz.\n\nÖner Yapı Market`,
    });
  }
  return result;
}

/** iyzico geri dönüşü: token ile sonucu sunucudan sorgular, imza ve tutarı doğrular. */
export async function handleIyzicoCallback(token: string) {
  const payment = await prisma.payment.findUnique({ where: { providerToken: token }, include: { order: true } });
  if (!payment) return null;
  if (payment.status === "PENDING") {
    const { raw, signatureOk } = await retrieveCheckoutForm(token, payment.conversationId);
    const success =
      raw.status === "success" && raw.paymentStatus === "SUCCESS" && signatureOk && raw.basketId === payment.orderId && raw.conversationId === payment.conversationId;
    await finalizePayment(payment.id, {
      success,
      providerPaymentId: raw.paymentId ?? null,
      paidPrice: raw.paidPrice !== undefined ? Number(raw.paidPrice) : undefined,
      errorCode: raw.errorCode ?? (signatureOk ? null : "SIGNATURE"),
      errorMessage: success ? null : raw.errorMessage ?? (!signatureOk ? "Yanıt imzası doğrulanamadı." : `Ödeme durumu: ${raw.paymentStatus ?? raw.status}`),
      raw,
    });
  }
  return payment.order.orderNumber;
}

/** Süresi dolan ödeme bekleyen siparişleri iptal eder ve ayrılan stoğu bırakır. */
export async function expireStaleOrders() {
  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lt: new Date() } },
    select: { id: true, payments: { where: { status: "PENDING" }, select: { id: true } } },
    take: 50,
  });
  for (const o of stale) {
    for (const p of o.payments) await finalizePayment(p.id, { success: false, errorCode: "EXPIRED", errorMessage: `Ödeme ${RESERVATION_MINUTES} dakika içinde tamamlanmadı.` });
  }
  return stale.length;
}
