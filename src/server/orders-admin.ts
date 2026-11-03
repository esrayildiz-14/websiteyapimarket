import "server-only";
import type { OrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { restock } from "./inventory";
import { sendEmail } from "./email";

export type Result = { ok: true; message: string } | { ok: false; message: string };

/**
 * Admin'in elle yapabileceği sipariş durum geçişleri. Kargo durumları (SHIPPED / DELIVERED) gönderi ekranından
 * otomatik güncellenir; ödeme durumu (PAID) yalnız ödeme sağlayıcısının doğrulamasıyla gelir, elle verilemez.
 */
const MANUAL: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAID: ["PREPARING", "CANCELLED"],
  PREPARING: ["CANCELLED"],
  SHIPPED: ["RETURN_REQUESTED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["REFUNDED", "DELIVERED"],
};
export const manualTransitions = (s: OrderStatus) => MANUAL[s] ?? [];

export async function changeOrderStatus(user: StaffUser, orderId: string, to: OrderStatus, note: string | null, restockItems: boolean): Promise<Result> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, shipments: true } });
  if (!o) return { ok: false, message: "Sipariş bulunamadı." };
  if (!manualTransitions(o.status).includes(to)) return { ok: false, message: `"${ORDER_STATUS_LABEL[o.status]}" durumundan "${ORDER_STATUS_LABEL[to]}" durumuna elle geçilemez.` };
  if (to === "CANCELLED" && o.shipments.some((s) => s.status !== "PREPARING")) return { ok: false, message: "Kargoya verilmiş gönderisi olan sipariş iptal edilemez; iade sürecini kullanın." };

  const now = new Date();
  const refundNote = "Ödeme iadesi iyzico üye işyeri panelinden yapılmalıdır (iade API entegrasyonu yok).";
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: to,
        ...(to === "CANCELLED" ? { cancelledAt: now } : {}),
        ...(to === "CANCELLED" || to === "REFUNDED" ? { adminNote: [o.adminNote, `${now.toLocaleString("tr-TR")}: ${refundNote}`].filter(Boolean).join("\n") } : {}),
      },
    });
    await tx.orderStatusHistory.create({ data: { orderId, fromStatus: o.status, toStatus: to, note, changedById: user.id } });
    if (to === "CANCELLED" || (to === "REFUNDED" && restockItems)) {
      for (const i of o.items)
        if (i.productId)
          await restock(tx, { productId: i.productId, variantId: i.variantId }, i.quantity, to === "CANCELLED" ? "CANCEL_IN" : "RETURN_IN", {
            userId: user.id, orderId, note: `${o.orderNumber} ${to === "CANCELLED" ? "iptal" : "iade"}`,
          });
    }
    if (to === "CANCELLED") await tx.shipment.deleteMany({ where: { orderId, status: "PREPARING" } });
  });
  if (to === "CANCELLED" || to === "REFUNDED") {
    await sendEmail({
      to: o.customerEmail,
      template: to === "CANCELLED" ? "order.cancelled" : "order.refunded",
      orderId,
      subject: `${o.orderNumber} — ${to === "CANCELLED" ? "siparişiniz iptal edildi" : "iadeniz tamamlandı"}`,
      body: `Merhaba ${o.customerName},\n\n${o.orderNumber} numaralı siparişiniz ${to === "CANCELLED" ? "iptal edildi" : "için iade işlemi tamamlandı"}.${note ? `\nAçıklama: ${note}` : ""}\n\nÖner Yapı Market`,
    });
  }
  await audit(user.id, "order.status", "Order", orderId, { status: o.status }, { status: to, note, restockItems });
  return { ok: true, message: `Sipariş durumu: ${ORDER_STATUS_LABEL[to]}.` + (to === "CANCELLED" || to === "REFUNDED" ? " " + refundNote : "") };
}

export async function saveAdminNote(user: StaffUser, orderId: string, note: string): Promise<Result> {
  await prisma.order.update({ where: { id: orderId }, data: { adminNote: note.slice(0, 2000) || null } });
  await audit(user.id, "order.note", "Order", orderId, undefined, { note });
  return { ok: true, message: "Not kaydedildi." };
}
