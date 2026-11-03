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
