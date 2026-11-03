import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { bannerAction, faqAction, pageAction } from "./actions";

export const metadata = { title: "Site içerikleri" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const dt = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default async function ContentPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("content.write");
  const sp = await searchParams;
  const tab = ["banner", "sayfa", "sss"].includes(String(sp.sekme)) ? String(sp.sekme) : "banner";
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Site içerikleri</h1>
          <p>Ana sayfa bannerları, kurumsal ve hukuki sayfalar, sıkça sorulan sorular.</p>
        </div>
      </div>
      <nav className="tabs-nav">
        <Link href="/admin/icerik?sekme=banner" aria-current={tab === "banner" ? "page" : undefined}>
          Bannerlar
        </Link>
        <Link href="/admin/icerik?sekme=sayfa" aria-current={tab === "sayfa" ? "page" : undefined}>
          Sayfalar
        </Link>
        <Link href="/admin/icerik?sekme=sss" aria-current={tab === "sss" ? "page" : undefined}>
          SSS
        </Link>
      </nav>
      <Flash sp={sp} />
      {tab === "banner" && <Banners />}
      {tab === "sayfa" && <Pages edit={typeof sp.duzenle === "string" ? sp.duzenle : null} />}
      {tab === "sss" && <Faqs />}
    </>
  );
}

async function Banners() {
  const banners = await prisma.banner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  const Form = ({ b }: { b?: (typeof banners)[number] }) => (
    <form action={bannerAction} className="form-grid card" encType="multipart/form-data" data-testid={b ? `banner-${b.id}` : "banner-new"}>
      {b && <input type="hidden" name="id" value={b.id} />}
      <label className="oy-field">
        <span className="oy-field__label req">Başlık</span>
        <input className="oy-input" name="title" defaultValue={b?.title ?? ""} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Alt başlık</span>
        <input className="oy-input" name="subtitle" defaultValue={b?.subtitle ?? ""} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Bağlantı</span>
        <input className="oy-input" name="linkUrl" defaultValue={b?.linkUrl ?? ""} placeholder="/kategori/boya-ve-boya-malzemeleri" />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Buton yazısı</span>
        <input className="oy-input" name="buttonText" defaultValue={b?.buttonText ?? ""} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Görsel</span>
        <input className="oy-input" type="file" name="image" accept="image/jpeg,image/png,image/webp" style={{ paddingTop: 8 }} />
        <span className="oy-field__hint">Önerilen 1600×500 px. Görsel kullanım hakkına sahip olmalısınız.</span>
      </label>
      {b?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.imageUrl} alt="" style={{ width: 200, height: 62, objectFit: "cover", borderRadius: 6 }} />
      )}
      <label className="oy-field">
        <span className="oy-field__label">Başlangıç</span>
        <input className="oy-input" type="datetime-local" name="startsAt" defaultValue={dt(b?.startsAt ?? null)} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Bitiş</span>
        <input className="oy-input" type="datetime-local" name="endsAt" defaultValue={dt(b?.endsAt ?? null)} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Sıra</span>
        <input className="oy-input" type="number" name="sortOrder" defaultValue={b?.sortOrder ?? 0} />
      </label>
      <label className="oy-check">
        <input type="checkbox" name="isActive" defaultChecked={b ? b.isActive : true} />
        <span>Aktif</span>
      </label>
      {b && (
        <label className="oy-check">
          <input type="checkbox" name="delete" />
          <span>Bu bannerı sil</span>
        </label>
      )}
      <div className="actions full">
        <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
          {b ? "Kaydet" : "Banner ekle"}
        </button>
      </div>
    </form>
  );
  return (
    <>
      {banners.map((b) => (
        <Form key={b.id} b={b} />
      ))}
      <h2>Yeni banner</h2>
      <Form />
    </>
  );
}

async function Pages({ edit }: { edit: string | null }) {
  const pages = await prisma.page.findMany({ orderBy: [{ type: "asc" }, { title: "asc" }] });
  const p = pages.find((x) => x.id === edit);
  return (
    <>
      <div className="flash warn">
        Hukuki metinler (KVKK, mesafeli satış sözleşmesi, ön bilgilendirme formu vb.) taslaktır. Türkiye&apos;de geçerli mevzuata uygunluğu bir hukuk uzmanı tarafından
        kontrol edilmeden canlı satışa geçilmemelidir. Onay işareti verilmeyen hukuki sayfalarda ziyaretçiye &quot;taslak&quot; uyarısı gösterilir.
      </div>
      <div className="tbl-wrap">
        <table className="tbl" data-testid="page-table">
          <tbody>
            {pages.map((x) => (
              <tr key={x.id}>
                <td>
                  <Link href={`/admin/icerik?sekme=sayfa&duzenle=${x.id}`} style={{ fontWeight: 600 }}>
                    {x.title}
                  </Link>
                  <div className="muted">/sayfa/{x.slug}</div>
                </td>
                <td>{x.type === "LEGAL" ? "Hukuki" : "Kurumsal"}</td>
                <td>
                  <span className={`pill ${x.isPublished ? "on" : "off"}`}>{x.isPublished ? "Yayında" : "Yayında değil"}</span>
                </td>
                <td>{x.type === "LEGAL" && <span className={`pill ${x.legalApproved ? "on" : "warn"}`}>{x.legalApproved ? "Uzman onaylı" : "Onay bekliyor"}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p && (
        <form action={pageAction} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="page-form">
          <input type="hidden" name="id" value={p.id} />
          <label className="oy-field">
            <span className="oy-field__label">Başlık</span>
            <input className="oy-input" name="title" defaultValue={p.title} />
          </label>
          <label className="oy-field">
            <span className="oy-field__label">İçerik</span>
            <textarea className="oy-input" name="content" defaultValue={p.content} rows={18} style={{ fontFamily: "monospace", fontSize: 13 }} />
            <span className="oy-field__hint">&quot;## &quot; ile başlayan satır başlık, &quot;- &quot; ile başlayan satır madde olur. Köşeli parantezli alanları gerçek bilgilerle doldurun.</span>
          </label>
          <label className="oy-check">
            <input type="checkbox" name="isPublished" defaultChecked={p.isPublished} />
            <span>Yayında</span>
          </label>
          {p.type === "LEGAL" && (
            <>
              <label className="oy-check">
                <input type="checkbox" name="legalApproved" defaultChecked={p.legalApproved} />
                <span>Bu metin hukuk uzmanı tarafından kontrol edildi ve onaylandı</span>
              </label>
              <label className="oy-check">
                <input type="checkbox" name="approveChange" />
                <span>İçerikte yaptığım değişiklik de uzman onayından geçti</span>
              </label>
            </>
          )}
          <div className="actions">
            <button className="oy-btn oy-btn--primary oy-btn--sm" type="submit">
              Sayfayı kaydet
            </button>
            <Link href={`/sayfa/${p.slug}`} target="_blank">
              Sitede görüntüle ↗
            </Link>
          </div>
        </form>
      )}
    </>
  );
}

async function Faqs() {
  const faqs = await prisma.faq.findMany({ orderBy: [{ groupName: "asc" }, { sortOrder: "asc" }] });
  const Form = ({ f }: { f?: (typeof faqs)[number] }) => (
    <form action={faqAction} className="form-grid card">
      {f && <input type="hidden" name="id" value={f.id} />}
      <label className="oy-field">
        <span className="oy-field__label">Grup</span>
        <input className="oy-input" name="groupName" defaultValue={f?.groupName ?? ""} />
      </label>
      <label className="oy-field full">
        <span className="oy-field__label">Soru</span>
        <input className="oy-input" name="question" defaultValue={f?.question ?? ""} />
      </label>
      <label className="oy-field full">
        <span className="oy-field__label">Cevap</span>
        <textarea className="oy-input" name="answer" rows={3} defaultValue={f?.answer ?? ""} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Sıra</span>
        <input className="oy-input" type="number" name="sortOrder" defaultValue={f?.sortOrder ?? 0} />
      </label>
      <label className="oy-check">
        <input type="checkbox" name="isActive" defaultChecked={f ? f.isActive : true} />
        <span>Yayında</span>
      </label>
      {f && (
        <label className="oy-check">
          <input type="checkbox" name="delete" />
          <span>Sil</span>
        </label>
      )}
      <div className="actions full">
        <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
          {f ? "Kaydet" : "Soru ekle"}
        </button>
      </div>
    </form>
  );
  return (
    <>
      {faqs.map((f) => (
        <Form key={f.id} f={f} />
      ))}
      <h2>Yeni soru</h2>
      <Form />
    </>
  );
}
