import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth/customer";
import { formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import { cartView } from "@/server/cart";
import { expireStaleOrders } from "@/server/checkout";
import { paymentProvider } from "@/server/payments";
import { iyzicoConfig } from "@/server/payments/iyzico";
import { placeOrderAction } from "../actions";

export const metadata = { title: "Ödeme", robots: { index: false } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CheckoutPage({ searchParams }: { searchParams: SP }) {
  const c = await requireCustomer("/odeme");
  await expireStaleOrders();
  const sp = await searchParams;
  const coupon = typeof sp.kupon === "string" ? sp.kupon.trim().slice(0, 40) : "";
  const methods = await prisma.shippingMethod.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const methodId = typeof sp.yontem === "string" && methods.some((m) => m.id === sp.yontem) ? sp.yontem : methods[0]?.id;
  const [v, addresses] = await Promise.all([
    cartView({ couponCode: coupon || null, shippingMethodId: methodId, userId: c.id }),
    prisma.address.findMany({ where: { userId: c.id, deletedAt: null }, include: { province: true, district: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  if (!v.okLines.length) redirect("/sepet");
  const provider = paymentProvider();
  const iyz = iyzicoConfig();

  return (
    <>
      <h1 className="h1">Ödeme</h1>
      <Flash sp={sp} />
      {!provider && (
        <div className="flash err" data-testid="no-provider">
          Ödeme altyapısı henüz yapılandırılmadı (iyzico anahtarları tanımlı değil). Şu an sipariş verilemez.
        </div>
      )}
      {provider === "test" && <div className="flash warn">TEST ödeme sağlayıcısı etkin — gerçek tahsilat yapılmaz.</div>}
      {provider === "iyzico" && iyz?.isTest && <div className="flash warn">iyzico TEST (sandbox) ortamı — gerçek tahsilat yapılmaz. Test kartlarıyla deneyin.</div>}
      {v.hasProblems && (
        <div className="flash err">
          Sepetinizde sorunlu ürün var. <Link href="/sepet">Sepete dönün</Link>.
        </div>
      )}

      {addresses.length === 0 ? (
        <div className="card">
          Teslimat için kayıtlı adresiniz yok.{" "}
          <Link href="/hesabim?devam=/odeme" className="oy-btn oy-btn--secondary oy-btn--sm">
            Adres ekle
          </Link>
        </div>
      ) : (
        <form action={placeOrderAction} style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", alignItems: "start" }} data-testid="checkout-form">
          <div style={{ display: "flex", flexDirection: "column", gap: 16, gridColumn: "span 2" }}>
            <section className="card">
              <h2>1. Teslimat adresi</h2>
              <div className="grid-2">
                {addresses.map((a, i) => (
                  <label key={a.id} className="oy-check card" style={{ alignItems: "flex-start", padding: 12 }}>
                    <input type="radio" name="addressId" value={a.id} defaultChecked={i === 0} />
                    <span>
                      <b>{a.title}</b> — {a.fullName}
                      <br />
                      <span className="muted">
                        {a.neighborhood}, {a.line}, {a.postalCode} {a.district.name}/{a.province.name} · {a.phone}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="muted">
                <Link href="/hesabim?devam=/odeme">+ Yeni adres ekle</Link> · Teslimat yalnız Türkiye içi adreslere yapılır.
              </p>
              <label className="oy-check">
                <input type="checkbox" name="billingSame" defaultChecked />
                <span>Fatura adresim teslimat adresiyle aynı</span>
              </label>
              <label className="oy-field" style={{ marginTop: 8 }}>
                <span className="oy-field__label">Farklı fatura adresi</span>
                <select className="oy-select" name="billingAddressId" defaultValue="">
                  <option value="">—</option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} — {a.district.name}/{a.province.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <section className="card">
              <h2>2. Teslimat yöntemi</h2>
              {methods.map((m) => (
                <label key={m.id} className="oy-check">
                  <input type="radio" name="shippingMethodId" value={m.id} defaultChecked={m.id === methodId} />
                  <span>
                    {m.name}
                    {Number(m.extraFee) > 0 ? ` (+${formatTL(m.extraFee)})` : ""} <span className="muted">{m.description}</span>
                  </span>
                </label>
              ))}
            </section>
            <section className="card">
              <h2>3. Ürünler ve kargo</h2>
              <table className="tbl">
                <tbody>
                  {v.okLines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.name}
                        {l.variantName ? ` — ${l.variantName}` : ""} × {l.quantity}
                      </td>
                      <td className="num">{formatTL(l.lineTotal)}</td>
                    </tr>
                  ))}
                  {v.shipping.packages.map((p, i) => (
                    <tr key={"p" + i} className="muted">
                      <td>{p.description}</td>
                      <td className="num">{p.free ? "Ücretsiz" : formatTL(p.fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label className="oy-field" style={{ marginTop: 12 }}>
                <span className="oy-field__label">Sipariş notu</span>
                <input className="oy-input" name="note" maxLength={500} />
              </label>
            </section>
          </div>
          <aside className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="checkout-summary">
            <h2>Özet</h2>
            <label className="oy-field">
              <span className="oy-field__label">İndirim kuponu</span>
              <input className="oy-input" name="coupon" defaultValue={coupon} style={{ textTransform: "uppercase" }} />
              {v.coupon && !v.coupon.ok && <span className="oy-field__error">{v.coupon.message}</span>}
              <span className="oy-field__hint">Kupon, ödeme sırasında sunucuda yeniden doğrulanır.</span>
            </label>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Ürünler</span>
              <span>{formatTL(v.subtotal)}</span>
            </div>
            {v.couponDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Kupon ({v.coupon?.code})</span>
                <span>−{formatTL(v.couponDiscount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Kargo</span>
              <span data-testid="checkout-shipping">{formatTL(v.shipping.total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
              <span>Toplam</span>
              <span data-testid="checkout-total">{formatTL(v.grandTotal)}</span>
            </div>
            <div className="muted">KDV dahil · İçindeki KDV {formatTL(v.vatTotal)}</div>
            <label className="oy-check" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" name="terms" />
              <span style={{ fontSize: 13 }}>
                <a href="/sayfa/on-bilgilendirme-formu" target="_blank">Ön Bilgilendirme Formu</a>’nu ve{" "}
                <a href="/sayfa/mesafeli-satis-sozlesmesi" target="_blank">Mesafeli Satış Sözleşmesi</a>’ni okudum, onaylıyorum.
              </span>
            </label>
            <button className="oy-btn oy-btn--primary oy-btn--block oy-btn--lg" type="submit" disabled={!provider || v.hasProblems} data-testid="place-order">
              Ödemeye geç
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              Kart bilgileriniz bu sitede girilmez ve saklanmaz; ödeme iyzico güvenli ödeme sayfasında yapılır.
            </span>
          </aside>
        </form>
      )}
    </>
  );
}
