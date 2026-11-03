import { handleIyzicoCallback } from "@/server/checkout";

/**
 * iyzico ödeme formunun geri dönüş adresi (callbackUrl). iyzico bu adrese "token" alanıyla POST yapar.
 * Sonuç istemciden gelen bilgiye göre DEĞİL, token ile iyzico'dan sunucu tarafında sorgulanarak belirlenir.
 */
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  const token = String(fd?.get("token") ?? "");
  if (!/^[A-Za-z0-9-]{10,100}$/.test(token)) return new Response("Geçersiz istek", { status: 400 });
  const orderNumber = await handleIyzicoCallback(token);
  if (!orderNumber) return new Response("Ödeme bulunamadı", { status: 404 });
  return Response.redirect(new URL(`/siparis/${orderNumber}/sonuc`, process.env.PUBLIC_BASE_URL || req.url), 303);
}
