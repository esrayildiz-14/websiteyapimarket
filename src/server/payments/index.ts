import "server-only";
import { iyzicoConfig } from "./iyzico";

/**
 * Etkin ödeme sağlayıcısı.
 *  - "iyzico": IYZICO_API_KEY ve IYZICO_SECRET_KEY tanımlıysa (varsayılan adres sandbox).
 *  - "test":   YALNIZ otomatik testler için sahte sağlayıcı. PAYMENT_TEST_PROVIDER=1 ve veritabanı adı "_test" ile
 *              bitiyorsa ve üretim modunda değilse etkinleşir. Gerçek para hareketi yoktur.
 *  - null:     Ödeme alınamaz; sipariş "ödeme bekliyor" durumunda kalır, asla "ödendi" olmaz.
 */
export function paymentProvider(): "iyzico" | "test" | null {
  if (testProviderAllowed()) return "test";
  if (iyzicoConfig()) return "iyzico";
  return null;
}

export function testProviderAllowed() {
  const db = process.env.DATABASE_URL ?? "";
  return process.env.PAYMENT_TEST_PROVIDER === "1" && process.env.NODE_ENV !== "production" && /\/[^/?]*_test(\?|$)/.test(db);
}

export type ProviderState =
  | { state: "SUCCESS"; providerPaymentId: string | null; paidPrice?: number; raw: unknown }
  | { state: "FAILED"; errorCode: string | null; errorMessage: string; raw: unknown }
  | { state: "UNKNOWN"; error: string };

/**
 * Mutabakat: ödemenin sağlayıcıdaki gerçek durumunu sorar (geri dönüş/bildirim gelmediğinde kullanılır).
 * Sağlayıcıya ulaşılamazsa UNKNOWN döner; bu durumda sipariş iptal edilmez, sonra tekrar sorulur.
 */
export async function providerPaymentState(p: {
  provider: string; providerToken: string | null; conversationId: string | null; orderId: string; amount: unknown; rawResponse: unknown;
}): Promise<ProviderState> {
  if (p.provider === "TEST") {
    const raw = p.rawResponse as { testProviderStatus?: string } | null;
    return raw?.testProviderStatus === "SUCCESS"
      ? { state: "SUCCESS", providerPaymentId: "test-sessiz", paidPrice: Number(p.amount), raw }
      : { state: "FAILED", errorCode: "NOT_COMPLETED", errorMessage: "Ödeme tamamlanmadı (test).", raw };
  }
  if (p.provider === "IYZICO") {
    if (!p.providerToken || !p.conversationId) return { state: "FAILED", errorCode: "NO_TOKEN", errorMessage: "Ödeme formu açılmamış.", raw: null };
    try {
      const { retrieveCheckoutForm } = await import("./iyzico");
      const { raw, signatureOk } = await retrieveCheckoutForm(p.providerToken, p.conversationId);
      const ok = raw.status === "success" && raw.paymentStatus === "SUCCESS" && signatureOk && raw.basketId === p.orderId && raw.conversationId === p.conversationId;
      if (ok) return { state: "SUCCESS", providerPaymentId: raw.paymentId ?? null, paidPrice: raw.paidPrice !== undefined ? Number(raw.paidPrice) : undefined, raw };
      return { state: "FAILED", errorCode: raw.errorCode ?? null, errorMessage: raw.errorMessage ?? `Ödeme durumu: ${raw.paymentStatus ?? raw.status}`, raw };
    } catch (e) {
      return { state: "UNKNOWN", error: String((e as Error)?.message ?? e) };
    }
  }
  return { state: "FAILED", errorCode: "UNKNOWN_PROVIDER", errorMessage: "Bilinmeyen sağlayıcı.", raw: null };
}
