import { prisma } from "@/lib/prisma";
import { finalizePayment } from "@/server/checkout";
import { testProviderAllowed } from "@/server/payments";

// Sahte sağlayıcının geri dönüşü — yalnız test veritabanında ve üretim dışında çalışır.
export async function POST(req: Request) {
  if (!testProviderAllowed()) return new Response("Bulunamadı", { status: 404 });
  const fd = await req.formData().catch(() => null);
  const token = String(fd?.get("token") ?? "");
  if (!fd || !token) return new Response("Geçersiz istek", { status: 400 });
  const outcome = String(fd.get("sonuc") ?? "");
  const p = await prisma.payment.findUnique({ where: { providerToken: token }, include: { order: true } });
  if (!p) return new Response("Bulunamadı", { status: 404 });
  if (outcome === "sessiz") {
    // Sağlayıcıda ödeme alındı ama siteye bildirim ulaşmadı (tarayıcı kapandı / bağlantı koptu) senaryosu
    await prisma.payment.update({ where: { id: p.id }, data: { rawResponse: { testProviderStatus: "SUCCESS" } } });
    return Response.redirect(new URL(`/siparis/${p.order.orderNumber}/sonuc`, req.url), 303);
  }
  await finalizePayment(p.id, {
    success: outcome === "basarili" || outcome === "tutar",
    providerPaymentId: "test-" + p.id,
    paidPrice: outcome === "tutar" ? Number(p.amount) - 1 : Number(p.amount),
    errorMessage: outcome === "basarisiz" ? "Kart reddedildi (test)" : null,
    raw: { test: true, outcome },
  });
  return Response.redirect(new URL(`/siparis/${p.order.orderNumber}/sonuc`, req.url), 303);
}
