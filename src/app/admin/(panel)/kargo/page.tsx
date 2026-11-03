import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { formatTL, toInputMoney } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import ShipmentControls from "@/components/admin/ShipmentControls";
import { SHIPMENT_LABEL } from "@/server/shipping-admin";
import { freeShippingThreshold } from "@/server/shipping-quote";
import { companyAction, methodAction, profileAction, thresholdAction } from "./actions";

export const metadata = { title: "Kargo yönetimi" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const TABS = [
  ["profiller", "Profiller ve tarifeler"],
  ["firmalar", "Kargo firmaları"],
  ["yontemler", "Teslimat yöntemleri"],
  ["gonderiler", "Gönderiler"],
  ["epostalar", "Bildirim e-postaları"],
] as const;

export default async function ShippingPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("shipping.write");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.sekme) ? (sp.sekme as string) : "profiller";
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Kargo yönetimi</h1>
          <p>Yalnız Türkiye içi adrese teslim. Kargo firması API entegrasyonu yok; gönderiler bu ekrandan manuel yönetilir.</p>
        </div>
      </div>
      <nav className="tabs-nav" aria-label="Kargo bölümleri">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/kargo?sekme=${k}`} aria-current={tab === k ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <Flash sp={sp} />
      {tab === "profiller" && <Profiles />}
      {tab === "firmalar" && <Companies />}
      {tab === "yontemler" && <Methods />}
      {tab === "gonderiler" && <Shipments />}
      {tab === "epostalar" && <Emails />}
    </>
  );
}

async function Profiles() {
  const [profiles, threshold] = await Promise.all([
    prisma.shippingProfile.findMany({ orderBy: { sortOrder: "asc" }, include: { rates: { orderBy: { minWeight: "asc" } }, _count: { select: { products: true } } } }),
    freeShippingThreshold(),
  ]);
  return (
    <>
      <section className="card">
        <h2>Sepet tutarına göre ücretsiz kargo</h2>
        <form action={thresholdAction} className="actions" data-testid="threshold-form">
          <input className="oy-input" name="threshold" defaultValue={threshold ? toInputMoney(threshold) : "0"} inputMode="decimal" aria-label="Ücretsiz kargo sınırı" style={{ width: 160 }} />
          <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
            Kaydet
          </button>
          <span className="muted">
            İndirimler düşüldükten sonraki ürün toplamı bu tutara ulaşınca, &quot;eşik kampanyasına dahil&quot; profillerin kargosu ücretsiz olur. 0 = kapalı.
          </span>
        </form>
      </section>
      {profiles.map((p) => (
        <section className="card" key={p.id} data-testid={`profile-${p.code}`}>
          <h2>
            {p.name} ({p.code}) · <span className="muted">{p._count.products} ürün</span>
          </h2>
          <p className="muted" style={{ marginTop: -6 }}>
            {p.packing === "COMBINED"
              ? "Standart ürünler aynı kolide birleşir; koli 30 kg/desi'yi aşınca yeni koli açılır. Her koli kademe tarifesinden bir kez ücretlenir."
              : `Her parça ayrı taşınır: taban ücret + tabana dahil ${p.code === "AGIR" ? "kg" : "desi"} üstü için birim ücret.`}
          </p>
          <form action={profileAction} className="form-grid">
            <input type="hidden" name="id" value={p.id} />
            <label className="oy-field">
              <span className="oy-field__label">{p.packing === "COMBINED" ? "Kademe dışı varsayılan ücret (₺)" : "Taban ücret (₺ / parça)"}</span>
              <input className="oy-input" name="basePrice" defaultValue={toInputMoney(p.basePrice)} inputMode="decimal" />
            </label>
            {p.packing === "PER_PIECE" ? (
              <>
                <label className="oy-field">
                  <span className="oy-field__label">Tabana dahil ({p.code === "AGIR" ? "kg" : "desi"})</span>
                  <input className="oy-input" name="baseIncludes" defaultValue={String(p.baseIncludes)} inputMode="decimal" />
                </label>
                <label className="oy-field">
                  <span className="oy-field__label">Fazlası için birim ücret (₺)</span>
                  <input className="oy-input" name="unitPrice" defaultValue={toInputMoney(p.unitPrice)} inputMode="decimal" />
                </label>
              </>
            ) : (
              <>
                <input type="hidden" name="baseIncludes" value="0" />
                <input type="hidden" name="unitPrice" value="0" />
              </>
            )}
            <label className="oy-field">
              <span className="oy-field__label">Teslim süresi en az (iş günü)</span>
              <input className="oy-input" name="transitDaysMin" type="number" min={1} max={30} defaultValue={p.transitDaysMin} />
            </label>
            <label className="oy-field">
              <span className="oy-field__label">Teslim süresi en çok (iş günü)</span>
              <input className="oy-input" name="transitDaysMax" type="number" min={1} max={30} defaultValue={p.transitDaysMax} />
            </label>
            <label className="oy-check" style={{ alignSelf: "end", minHeight: 44 }}>
              <input type="checkbox" name="freeShippingEligible" defaultChecked={p.freeShippingEligible} />
              <span>Sepet tutarı eşiği kampanyasına dahil</span>
            </label>
            <label className="oy-field full">
              <span className="oy-field__label">Müşteriye gösterilecek teslimat notu</span>
              <input className="oy-input" name="deliveryNote" defaultValue={p.deliveryNote ?? ""} maxLength={300} />
            </label>
            {p.packing === "COMBINED" && (
              <div className="full">
                <span className="oy-field__label">Kademeler (ücrete esas kg/desi: en az &lt; x ≤ en çok)</span>
                <table className="tbl" style={{ maxWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>En az</th>
                      <th>En çok</th>
                      <th>Ücret (₺)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...p.rates, null, null].map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input className="oy-input" name="rateMin" defaultValue={r ? String(r.minWeight) : ""} aria-label={`Kademe ${i + 1} en az`} />
                        </td>
                        <td>
                          <input className="oy-input" name="rateMax" defaultValue={r ? String(r.maxWeight) : ""} aria-label={`Kademe ${i + 1} en çok`} />
                        </td>
                        <td>
                          <input className="oy-input" name="ratePrice" defaultValue={r ? toInputMoney(r.price) : ""} aria-label={`Kademe ${i + 1} ücret`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <span className="muted">Satırı silmek için iki kutuyu da boşaltın. Kademeler 0'dan başlamalı ve boşluksuz devam etmeli.</span>
              </div>
            )}
            <div className="actions full">
              <button className="oy-btn oy-btn--primary oy-btn--sm" type="submit">
                {p.name} tarifesini kaydet
              </button>
            </div>
          </form>
        </section>
      ))}
    </>
  );
}

async function Companies() {
  const companies = await prisma.cargoCompany.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { shipments: true } } } });
  const Row = ({ c }: { c?: (typeof companies)[number] }) => (
    <form action={companyAction} className="form-grid card" data-testid={c ? `company-${c.id}` : "company-new"}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className="oy-field">
        <span className="oy-field__label req">Firma adı</span>
        <input className="oy-input" name="name" defaultValue={c?.name ?? ""} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Takip adresi şablonu</span>
        <input className="oy-input" name="trackingUrlTemplate" defaultValue={c?.trackingUrlTemplate ?? ""} placeholder="https://…?no={no}" />
        <span className="oy-field__hint">Firmanın resmi takip sayfası; {"{no}"} takip numarasıyla değişir.</span>
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Anlaşma durumu / not</span>
        <input className="oy-input" name="agreementNote" defaultValue={c?.agreementNote ?? ""} />
      </label>
      <label className="oy-check" style={{ alignSelf: "end", minHeight: 44 }}>
        <input type="checkbox" name="isActive" defaultChecked={c ? c.isActive : true} />
        <span>Aktif {c ? `· ${c._count.shipments} gönderi` : ""}</span>
      </label>
      <div className="actions full">
        <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
          {c ? "Kaydet" : "Firma ekle"}
        </button>
      </div>
    </form>
  );
  return (
    <>
      <div className="flash warn">Kargo firmalarıyla anlaşma ve API entegrasyonu henüz yapılmadı (varsayım ASM-02). Gönderiler takip numarası elle girilerek yönetilir.</div>
      {companies.map((c) => (
        <Row key={c.id} c={c} />
      ))}
      <h2>Yeni kargo firması</h2>
      <Row />
    </>
  );
}

async function Methods() {
  const [methods, companies] = await Promise.all([
    prisma.shippingMethod.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.cargoCompany.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const Row = ({ m }: { m?: (typeof methods)[number] }) => (
    <form action={methodAction} className="form-grid card" data-testid={m ? `method-${m.code}` : "method-new"}>
      {m && <input type="hidden" name="id" value={m.id} />}
      <label className="oy-field">
        <span className="oy-field__label req">Ad</span>
        <input className="oy-input" name="name" defaultValue={m?.name ?? ""} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Kod</span>
        <input className="oy-input" name="code" defaultValue={m?.code ?? ""} style={{ textTransform: "uppercase" }} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Kargo firması</span>
        <select className="oy-select" name="cargoCompanyId" defaultValue={m?.cargoCompanyId ?? ""}>
          <option value="">Sipariş hazırlanırken seçilir</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Ek ücret (₺, sipariş başına)</span>
        <input className="oy-input" name="extraFee" defaultValue={m ? toInputMoney(m.extraFee) : "0"} inputMode="decimal" />
      </label>
      <label className="oy-field full">
        <span className="oy-field__label">Açıklama</span>
        <input className="oy-input" name="description" defaultValue={m?.description ?? ""} />
      </label>
      <label className="oy-check">
        <input type="checkbox" name="isActive" defaultChecked={m ? m.isActive : true} />
        <span>Ödeme adımında göster</span>
      </label>
      <div className="actions full">
        <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
          {m ? "Kaydet" : "Yöntem ekle"}
        </button>
      </div>
    </form>
  );
  return (
    <>
      <p className="muted">Mağazadan teslim ve yurt dışı gönderim yöntemleri bulunmaz. Kargo ücreti ürünlerin kargo profillerinden hesaplanır; ek ücret buna eklenir.</p>
      {methods.map((m) => (
        <Row key={m.id} m={m} />
      ))}
      <h2>Yeni teslimat yöntemi</h2>
      <Row />
    </>
  );
}

async function Shipments() {
  const [shipments, companies] = await Promise.all([
    prisma.shipment.findMany({
      where: { order: { isDemo: false, status: { in: ["PAID", "PREPARING", "SHIPPED", "DELIVERED"] } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: { order: true, cargoCompany: true, events: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.cargoCompany.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="tbl-wrap">
      <table className="tbl" data-testid="shipment-table">
        <thead>
          <tr>
            <th>Sipariş</th>
            <th>Paket</th>
            <th>Durum</th>
            <th>Firma / takip</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {shipments.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Ödenmiş siparişe ait gönderi yok.
              </td>
            </tr>
          )}
          {shipments.map((s) => (
            <tr key={s.id} data-testid={`shipment-${s.id}`}>
              <td>
                <Link href={`/admin/siparisler/${s.orderId}`} style={{ fontWeight: 600 }}>
                  {s.order.orderNumber}
                </Link>
                <div className="muted">
                  {s.order.customerName} · {(s.order.shippingAddress as { province?: string })?.province ?? ""}
                </div>
              </td>
              <td>
                {s.description}
                <div className="muted">{formatTL(s.chargedFee)}</div>
              </td>
              <td>
                <span className={`pill ${s.status === "DELIVERED" ? "on" : s.status === "RETURNED" ? "err" : "info"}`} data-testid="shipment-status">
                  {SHIPMENT_LABEL[s.status]}
                </span>
              </td>
              <td>
                {s.cargoCompany?.name ?? "—"}
                <div className="muted">{s.trackingNumber ?? ""}</div>
              </td>
              <td>
                <ShipmentControls shipment={s} companies={companies} back="/admin/kargo?sekme=gonderiler" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Emails() {
  const emails = await prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <>
      <div className="flash warn">E-posta gönderimi yapılandırılmadı. Bildirimler hazırlanır ve burada saklanır, müşteriye gönderilmez.</div>
      <div className="tbl-wrap">
        <table className="tbl" data-testid="email-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Alıcı</th>
              <th>Konu</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((e) => (
              <tr key={e.id}>
                <td>{e.createdAt.toLocaleString("tr-TR")}</td>
                <td>{e.toEmail}</td>
                <td>
                  <details>
                    <summary>{e.subject}</summary>
                    <pre style={{ whiteSpace: "pre-wrap", font: "inherit", fontSize: 13 }}>{e.body}</pre>
                  </details>
                </td>
                <td>
                  <span className={`pill ${e.status === "SENT" ? "on" : e.status === "FAILED" ? "err" : "off"}`}>{e.status === "LOGGED" ? "Kayda yazıldı" : e.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
