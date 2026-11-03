import "server-only";
import { prisma } from "@/lib/prisma";
import { couponDiscount } from "@/lib/coupon-rules";

export async function evaluateCoupon(codeRaw: string, subtotal: number, userId: string | null) {
  const code = codeRaw.trim().toUpperCase();
  const c = await prisma.coupon.findUnique({ where: { code } });
  if (!c) return { ok: false as const, code, message: "Kupon bulunamadı." };
  const userUses = userId
    ? await prisma.order.count({ where: { userId, couponCode: code, status: { in: ["PAID", "PREPARING", "SHIPPED", "DELIVERED"] } } })
    : 0;
  const r = couponDiscount(
    {
      type: c.type, value: Number(c.value), minOrderTotal: c.minOrderTotal === null ? null : Number(c.minOrderTotal),
      maxDiscount: c.maxDiscount === null ? null : Number(c.maxDiscount), usageLimit: c.usageLimit, perUserLimit: c.perUserLimit,
      usedCount: c.usedCount, startsAt: c.startsAt, endsAt: c.endsAt, isActive: c.isActive,
    },
    subtotal,
    userUses,
  );
  return r.ok ? { ok: true as const, code, discount: r.discount, id: c.id } : { ok: false as const, code, message: r.message };
}
