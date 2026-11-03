import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import ImportForm from "./ImportForm";

export const metadata = { title: "Toplu ürün içe aktarma" };

export default async function ImportPage() {
  await requireStaff("product.write");
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Excel ile toplu ürün içe aktarma</h1>
          <p>Ürün kodu sistemde varsa ürün güncellenir, yoksa eklenir. Her satır, tek ürün formundaki doğrulamanın aynısından geçer.</p>
        </div>
        <Link href="/admin/urunler">‹ Ürün listesi</Link>
      </div>
      <section className="card">
        <h2>1. Şablonu indirin</h2>
        <p>
          <a className="oy-btn oy-btn--outline" href="/admin/sablon-urun" data-testid="template-link">
            Ürün şablonunu indir (.xlsx)
          </a>
        </p>
        <ul className="muted">
          <li>Marka, model, ölçü (ağırlık, en, yükseklik, boy), satış birimi ve 10 adede kadar teknik özellik sütunu vardır.</li>
          <li>Teknik özellikleri yalnız üretici/tedarikçi belgesiyle doğruladıysanız girin; sistem özellik üretmez veya tamamlamaz.</li>
          <li>&quot;Bilgiler doğrulandı&quot; sütunu Evet değilse ürün pasif kaydedilir ve sitede görünmez.</li>
          <li>Görseller Excel ile alınmaz; ürün düzenleme sayfasından yüklenir.</li>
        </ul>
      </section>
      <h2>2. Dosyayı yükleyin</h2>
      <ImportForm />
    </>
  );
}
