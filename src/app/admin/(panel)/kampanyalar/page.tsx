import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import { couponAction, discountAction } from "./actions";

export const metadata = { title: "Kampanyalar" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const dt = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const TARGET = { ALL: "Tüm ürünler", PRODUCT: "Ürün", CATEGORY: "Kategori", BRAND: "Marka" } as const;

export default async function CampaignsPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("campaign.write");
  const sp = await searchParams;
  const tab = sp.sekme === "kupon" ? "kupon" : "indirim";
  const [discounts, coupons, mains, brands] = await Promise.all([
    prisma.discount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" }, include: { children: { orderBy: { sortOrder: "asc" } } } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ]);
  const now = new Date();
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Kampanya yönetimi</h1>
          <p>Kampanyalar ürün fiyatına otomatik uygulanır; kuponu müşteri ödeme adımında girer. Birden fazla kampanya varsa en düşük fiyat geçerlidir.</p>
        </div>
      </div>
      <nav className="tabs-nav">
        <Link href="/admin/kampanyalar" aria-current={tab === "indirim" ? "page" : undefined}>
          İndirim kampanyaları
        </Link>
        <Link href="/admin/kampanyalar?sekme=kupon" aria-current={tab === "kupon" ? "page" : undefined}>
          Kuponlar
        </Link>
      </nav>
      <Flash sp={sp} />
      {tab === "indirim" ? (
        <>
          <div className="tbl-wrap">
            <table className="tbl" data-testid="discount-table">
              <tbody>
                {discounts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.type === "PERCENT" ? `%${Number(d.value)}` : formatTL(d.value)}</td>
                    <td>{TARGET[d.target]}</td>
                    <td>
                      {d.startsAt.toLocaleString("tr-TR")} – {d.endsAt.toLocaleString("tr-TR")}
                    </td>
                    <td>
                      <span className={`pill ${d.isActive && d.startsAt <= now && d.endsAt >= now ? "on" : "off"}`}>
                        {d.isActive ? (d.endsAt < now ? "Süresi doldu" : d.startsAt > now ? "Planlandı" : "Yayında") : "Pasif"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="card">
            <h2>Yeni kampanya</h2>
            <form action={discountAction} className="form-grid" data-testid="discount-form">
              <label className="oy-field">
                <span className="oy-field__label req">Ad</span>
                <input className="oy-input" name="name" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Tür</span>
                <select className="oy-select" name="type">
                  <option value="PERCENT">Yüzde (%)</option>
                  <option value="FIXED">Tutar (₺)</option>
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Değer</span>
                <input className="oy-input" name="value" inputMode="decimal" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Kapsam</span>
                <select className="oy-select" name="target">
                  {Object.entries(TARGET).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Ürün kodu (kapsam: ürün)</span>
                <input className="oy-input" name="productSku" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Kategori (kapsam: kategori)</span>
                <select className="oy-select" name="categoryId" defaultValue="">
                  <option value="">—</option>
                  {mains.map((m) => (
                    <optgroup key={m.id} label={m.name}>
                      <option value={m.id}>{m.name} (tümü)</option>
                      {m.children.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Marka (kapsam: marka)</span>
                <select className="oy-select" name="brandId" defaultValue="">
                  <option value="">—</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Başlangıç</span>
                <input className="oy-input" name="startsAt" type="datetime-local" defaultValue={dt(now)} />
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Bitiş</span>
                <input className="oy-input" name="endsAt" type="datetime-local" />
              </label>
              <label className="oy-check">
                <input type="checkbox" name="isActive" defaultChecked />
                <span>Aktif</span>
              </label>
              <div className="actions full">
                <button className="oy-btn oy-btn--primary" type="submit" data-testid="discount-submit">
                  Kampanyayı kaydet
                </button>
              </div>
            </form>
          </section>
        </>
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl" data-testid="coupon-table">
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.code}</b>
                    </td>
                    <td>{c.type === "PERCENT" ? `%${Number(c.value)}` : formatTL(c.value)}</td>
                    <td>{c.minOrderTotal ? `Min. ${formatTL(c.minOrderTotal)}` : "—"}</td>
                    <td>
                      {c.usedCount}
                      {c.usageLimit !== null ? ` / ${c.usageLimit}` : ""} kullanım
                    </td>
                    <td>
                      <span className={`pill ${c.isActive ? "on" : "off"}`}>{c.isActive ? "Aktif" : "Pasif"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="card">
            <h2>Yeni kupon</h2>
            <form action={couponAction} className="form-grid" data-testid="coupon-form">
              <label className="oy-field">
                <span className="oy-field__label req">Kod</span>
                <input className="oy-input" name="code" style={{ textTransform: "uppercase" }} />
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Tür</span>
                <select className="oy-select" name="type">
                  <option value="PERCENT">Yüzde (%)</option>
                  <option value="FIXED">Tutar (₺)</option>
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Değer</span>
                <input className="oy-input" name="value" inputMode="decimal" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">En az sepet tutarı (₺)</span>
                <input className="oy-input" name="minOrderTotal" inputMode="decimal" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">En fazla indirim (₺)</span>
                <input className="oy-input" name="maxDiscount" inputMode="decimal" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Toplam kullanım limiti</span>
                <input className="oy-input" name="usageLimit" type="number" min={0} />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Müşteri başına limit</span>
                <input className="oy-input" name="perUserLimit" type="number" min={0} />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Başlangıç</span>
                <input className="oy-input" name="startsAt" type="datetime-local" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Bitiş</span>
                <input className="oy-input" name="endsAt" type="datetime-local" />
              </label>
              <label className="oy-check">
                <input type="checkbox" name="isActive" defaultChecked />
                <span>Aktif</span>
              </label>
              <div className="actions full">
                <button className="oy-btn oy-btn--primary" type="submit" data-testid="coupon-submit">
                  Kuponu kaydet
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </>
  );
}
