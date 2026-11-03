import "server-only";
import { authHeaders, iyzPrice, responseSignature, sigPrice } from "@/lib/iyzico-sign";

/**
 * iyzico Ödeme Formu (Checkout Form) entegrasyonu — IYZWSv2 (HMAC-SHA256) kimlik doğrulama.
 * Anahtarlar yalnız ortam değişkenlerinden okunur (IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL).
 * Varsayılan adres SANDBOX'tır; canlı adres ancak açıkça tanımlanırsa kullanılır.
 * Kaynak: docs.iyzico.com — hmacsha256-auth, response-signature-validation.
 */
export const IYZICO_SANDBOX = "https://sandbox-api.iyzipay.com";

export function iyzicoConfig() {
  const apiKey = process.env.IYZICO_API_KEY?.trim();
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) return null;
  const baseUrl = (process.env.IYZICO_BASE_URL?.trim() || IYZICO_SANDBOX).replace(/\/$/, "");
  return { apiKey, secretKey, baseUrl, isTest: baseUrl.includes("sandbox") };
}

async function call<T>(path: string, payload: unknown): Promise<T> {
  const cfg = iyzicoConfig();
  if (!cfg) throw new Error("iyzico anahtarları tanımlı değil.");
  const body = JSON.stringify(payload);
  // Zaman aşımı: iyzico yanıt vermezse istek 20 sn sonra kesilir; çağıran taraf ödemeyi "bekliyor" bırakır ve sonra mutabakat yapılır.
  const res = await fetch(cfg.baseUrl + path, {
    method: "POST", headers: authHeaders(cfg.apiKey, cfg.secretKey, path, body), body, cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok && res.status >= 500) throw new Error(`iyzico geçici hata (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

export type IyzBuyer = {
  id: string; name: string; surname: string; gsmNumber: string; email: string; identityNumber: string;
  registrationAddress: string; ip: string; city: string; country: string; zipCode: string;
  lastLoginDate?: string; registrationDate?: string;
};
export type IyzAddress = { contactName: string; city: string; country: string; address: string; zipCode: string };
export type IyzBasketItem = { id: string; name: string; category1: string; itemType: "PHYSICAL"; price: string };

export async function initializeCheckoutForm(req: {
  conversationId: string; basketId: string; price: number; callbackUrl: string;
  buyer: IyzBuyer; shippingAddress: IyzAddress; billingAddress: IyzAddress; basketItems: IyzBasketItem[];
}) {
  const r = await call<{ status: string; errorCode?: string; errorMessage?: string; token?: string; paymentPageUrl?: string; checkoutFormContent?: string; conversationId?: string; signature?: string }>(
    "/payment/iyzipos/checkoutform/initialize/auth/ecom",
    {
      locale: "tr",
      conversationId: req.conversationId,
      price: iyzPrice(req.price),
      paidPrice: iyzPrice(req.price),
      currency: "TRY",
      basketId: req.basketId,
      paymentGroup: "PRODUCT",
      callbackUrl: req.callbackUrl,
      enabledInstallments: [1],
      buyer: req.buyer,
      shippingAddress: req.shippingAddress,
      billingAddress: req.billingAddress,
      basketItems: req.basketItems,
    },
  );
  if (r.status === "success" && r.signature) {
    const cfg = iyzicoConfig()!;
    if (responseSignature(cfg.secretKey, [r.conversationId, r.token]) !== r.signature) return { ...r, status: "failure", errorMessage: "İmza doğrulanamadı." };
  }
  return r;
}

export type IyzRetrieve = {
  status: string; paymentStatus?: string; paymentId?: string; currency?: string; basketId?: string; conversationId?: string;
  paidPrice?: number | string; price?: number | string; token?: string; signature?: string; errorCode?: string; errorMessage?: string;
  fraudStatus?: number;
};

/** Ödeme sonucunu iyzico'dan SUNUCU tarafında sorgular ve imzayı doğrular. */
export async function retrieveCheckoutForm(token: string, conversationId: string) {
  const r = await call<IyzRetrieve>("/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", conversationId, token });
  const cfg = iyzicoConfig()!;
  let signatureOk = false;
  if (r.signature) {
    const expected = responseSignature(cfg.secretKey, [r.paymentStatus, r.paymentId, r.currency, r.basketId, r.conversationId, sigPrice(r.paidPrice), sigPrice(r.price), r.token]);
    signatureOk = expected === r.signature;
  }
  return { raw: r, signatureOk };
}
