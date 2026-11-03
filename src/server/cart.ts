import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/auth/session";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { effectivePrice } from "@/lib/pricing";
import { round2 } from "@/lib/money";
import { activeDiscounts, VISIBLE } from "./catalog";
import { quoteShipping } from "./shipping-quote";
import { evaluateCoupon } from "./coupons";

export const CART_COOKIE = "oy_cart";
export const MAX_QTY = 999;

/** Geçerli sepet: girişli müşteride kullanıcıya bağlı, misafirde çerezdeki anahtara bağlı. */
export async function currentCart(create: boolean) {
  const customer = await getCurrentCustomer();
  const jar = await cookies();
  const raw = jar.get(CART_COOKIE)?.value;
  const guest = raw ? await prisma.cart.findUnique({ where: { token: sha256(raw) } }) : null;

  if (customer) {
    let mine = await prisma.cart.findFirst({ where: { userId: customer.id }, orderBy: { updatedAt: "desc" } });
    if (guest && guest.id !== mine?.id && !guest.userId) {
      // misafir sepetini müşterinin sepetine taşı (giriş sonrası)
      if (!mine) mine = await prisma.cart.update({ where: { id: guest.id }, data: { userId: customer.id } });
      else await mergeCarts(guest.id, mine.id);
    }
    if (!mine && create) mine = await prisma.cart.create({ data: { token: sha256(randomBytes(24).toString("base64url")), userId: customer.id } });
    return mine;
  }
  if (guest && !guest.userId) return guest;
  if (!create) return null;
  const token = randomBytes(24).toString("base64url");
  const cart = await prisma.cart.create({ data: { token: sha256(token) } });
  jar.set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return cart;
}

async function mergeCarts(fromId: string, toId: string) {
  const items = await prisma.cartItem.findMany({ where: { cartId: fromId } });
  await prisma.$transaction([
    ...items.map((i) =>
      prisma.cartItem.upsert({
        where: { cartId_lineKey: { cartId: toId, lineKey: i.lineKey } },
        update: { quantity: { increment: i.quantity } },
        create: { cartId: toId, lineKey: i.lineKey, productId: i.productId, variantId: i.variantId, quantity: i.quantity },
      }),
    ),
    prisma.cart.delete({ where: { id: fromId } }),
  ]);
  await prisma.cartItem.updateMany({ where: { cartId: toId, quantity: { gt: MAX_QTY } }, data: { quantity: MAX_QTY } });
}

const lineKey = (productId: string, variantId?: string | null) => (variantId ? `${productId}:${variantId}` : productId);

async function sellable(productId: string, variantId?: string | null) {
  const p = await prisma.product.findFirst({ where: { id: productId, ...VISIBLE }, include: { inventory: true } });
  if (!p) return null;
  if (variantId) {
    const v = await prisma.productVariant.findFirst({ where: { id: variantId, productId, isActive: true }, include: { inventory: true } });
    if (!v) return null;
    return { name: `${p.name} — ${v.name}`, available: Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0)) };
  }
  return { name: p.name, available: Math.max(0, (p.inventory?.quantity ?? 0) - (p.inventory?.reserved ?? 0)) };
}

export type CartResult = { ok: boolean; message: string };

export async function addToCart(productId: string, variantId: string | null, qty: number): Promise<CartResult> {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, message: "Adet 1 ile 999 arasında olmalı." };
  const s = await sellable(productId, variantId);
  if (!s) return { ok: false, message: "Ürün satışta değil." };
  if (s.available <= 0) return { ok: false, message: `${s.name} şu an stokta yok.` };
  const cart = (await currentCart(true))!;
  const key = lineKey(productId, variantId);
  const existing = await prisma.cartItem.findUnique({ where: { cartId_lineKey: { cartId: cart.id, lineKey: key } } });
  const wanted = (existing?.quantity ?? 0) + qty;
  const final = Math.min(wanted, s.available, MAX_QTY);
  await prisma.cartItem.upsert({
    where: { cartId_lineKey: { cartId: cart.id, lineKey: key } },
    update: { quantity: final },
    create: { cartId: cart.id, lineKey: key, productId, variantId, quantity: final },
  });
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  return final < wanted
    ? { ok: true, message: `Stokta ${s.available} adet var; sepetinizdeki adet ${final} olarak ayarlandı.` }
    : { ok: true, message: `${s.name} sepete eklendi.` };
}

export async function setQuantity(itemId: string, qty: number): Promise<CartResult> {
  const cart = await currentCart(false);
  const item = cart ? await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } }) : null;
  if (!item) return { ok: false, message: "Sepet satırı bulunamadı." };
  if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) return { ok: false, message: "Adet 0 ile 999 arasında olmalı." };
  if (qty === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return { ok: true, message: "Ürün sepetten çıkarıldı." };
  }
  const s = await sellable(item.productId, item.variantId);
  if (!s) return { ok: false, message: "Ürün artık satışta değil; sepetten çıkarabilirsiniz." };
  const final = Math.min(qty, s.available);
  if (final <= 0) return { ok: false, message: `${s.name} şu an stokta yok.` };
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: final } });
  return final < qty ? { ok: true, message: `Stokta ${s.available} adet var; adet ${final} olarak ayarlandı.` } : { ok: true, message: "Sepet güncellendi." };
}

export async function removeItem(itemId: string): Promise<CartResult> {
  const cart = await currentCart(false);
  if (!cart) return { ok: false, message: "Sepet bulunamadı." };
  const r = await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  return r.count ? { ok: true, message: "Ürün sepetten çıkarıldı." } : { ok: false, message: "Sepet satırı bulunamadı." };
}

export type CartLineView = {
  id: string; productId: string; variantId: string | null; name: string; variantName: string | null; slug: string; sku: string;
  image: string | null; brand: string | null; unitPrice: number; listPrice: number; quantity: number; lineTotal: number; vatRate: number;
  available: number; problem: string | null; profileCode: string; freeShipping: boolean; saleUnit: string;
  weightKg: number; widthCm: number; heightCm: number; lengthCm: number;
};

/**
 * Sepetin sunucuda yeniden fiyatlanmış görünümü. Tüm tutarlar veritabanından ve aktif kampanyalardan hesaplanır;
 * istemciden gelen fiyat kullanılmaz. Sorunlu satırlar (pasif ürün, stok yok, adet > stok) işaretlenir.
 */
export async function cartView(opts: { couponCode?: string | null; shippingMethodId?: string | null; userId?: string | null } = {}) {
  const cart = await currentCart(false);
  const items = cart
    ? await prisma.cartItem.findMany({
        where: { cartId: cart.id },
        orderBy: { createdAt: "asc" },
        include: {
          product: { include: { inventory: true, brand: true, category: { include: { parent: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1 }, shippingProfile: true } },
          variant: { include: { inventory: true } },
        },
      })
    : [];
  const rules = await activeDiscounts();
  const lines: CartLineView[] = items.map((i) => {
    const p = i.product;
    const v = i.variant;
    const inv = v ? v.inventory : p.inventory;
    const available = Math.max(0, (inv?.quantity ?? 0) - (inv?.reserved ?? 0));
    const visible = p.status === "ACTIVE" && !p.deletedAt && p.category.isActive && (!p.category.parent || p.category.parent.isActive) && (!v || v.isActive);
    const ep = effectivePrice(
      {
        id: p.id,
        price: Number(v?.price ?? p.price),
        salePrice: v ? (v.salePrice === null ? null : Number(v.salePrice)) : p.salePrice === null ? null : Number(p.salePrice),
        categoryId: p.categoryId,
        categoryParentId: p.category.parentId,
        brandId: p.brandId,
      },
      rules,
    );
    const problem = !visible ? "Bu ürün artık satışta değil." : available <= 0 ? "Stokta yok." : i.quantity > available ? `Stokta yalnız ${available} adet var.` : null;
    return {
      id: i.id, productId: p.id, variantId: v?.id ?? null, name: p.name, variantName: v?.name ?? null, slug: p.slug, sku: v?.sku ?? p.sku,
      image: p.images[0]?.url ?? null, brand: p.brand?.name ?? null, unitPrice: ep.price, listPrice: ep.listPrice, quantity: i.quantity,
      lineTotal: round2(ep.price * i.quantity), vatRate: p.vatRate, available, problem, profileCode: p.shippingProfile.code,
      freeShipping: p.freeShipping, saleUnit: p.saleUnit,
      weightKg: Number(v?.weightKg ?? p.weightKg), widthCm: Number(p.widthCm), heightCm: Number(p.heightCm), lengthCm: Number(p.lengthCm),
    };
  });
  const ok = lines.filter((l) => !l.problem);
  const subtotal = round2(ok.reduce((s, l) => s + l.lineTotal, 0));
  const listTotal = round2(ok.reduce((s, l) => s + l.listPrice * l.quantity, 0));
  const coupon = opts.couponCode ? await evaluateCoupon(opts.couponCode, subtotal, opts.userId ?? null) : null;
  const couponDiscount = coupon?.ok ? coupon.discount : 0;
  const merchandise = round2(subtotal - couponDiscount);
  const shipping = await quoteShipping(
    ok.map((l) => ({ qty: l.quantity, name: l.name, profileCode: l.profileCode, freeShipping: l.freeShipping, weightKg: l.weightKg, widthCm: l.widthCm, heightCm: l.heightCm, lengthCm: l.lengthCm })),
    merchandise,
    opts.shippingMethodId,
  );
  const grandTotal = round2(merchandise + shipping.total);
  // KDV (dahil) dökümü: kupon indirimi satırlara tutar oranında dağıtılır; kargo %20 KDV dahil kabul edilir (VARSAYIM)
  const ratio = subtotal > 0 ? merchandise / subtotal : 0;
  const vatTotal = round2(ok.reduce((s, l) => s + (l.lineTotal * ratio * l.vatRate) / (100 + l.vatRate), 0) + (shipping.total * 20) / 120);
  return {
    cart, lines, okLines: ok, hasProblems: lines.some((l) => l.problem),
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal, campaignSavings: round2(listTotal - subtotal), coupon, couponDiscount, merchandise, shipping, grandTotal, vatTotal,
  };
}
export type CartView = Awaited<ReturnType<typeof cartView>>;
