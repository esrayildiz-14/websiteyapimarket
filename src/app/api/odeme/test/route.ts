import { prisma } from "@/lib/prisma";
import { finalizePayment } from "@/server/checkout";
import { testProviderAllowed } from "@/server/payments";

// Sahte sağlayıcının geri dönüşü — yalnız test veritabanında ve üretim dışında çalışır.
export async function POST(req: Request) {
  if (!testProviderAllowed()) return new Response("Bulunamadı", { status: 404 });
  const fd = await req.formData();
  const token = String(fd.get("token") ?? "");
  const outcome = String(fd.get("sonuc") ?? "");
  const p = await prisma.payment.findUnique({ where: { providerToken: token }, include: { order: true } });
  if (!p) return new Response("Bulunamadı", { status: 404 });
  await finalizePayment(p.id, {
    success: outcome === "basarili" || outcome === "tutar",
    providerPaymentId: "test-" + p.id,
    paidPrice: outcome === "tutar" ? Number(p.amount) - 1 : Number(p.amount),
    errorMessage: outcome === "basarisiz" ? "Kart reddedildi (test)" : null,
    raw: { test: true, outcome },
  });
  return Response.redirect(new URL(`/siparis/${p.order.orderNumber}/sonuc`, req.url), 303);
}
