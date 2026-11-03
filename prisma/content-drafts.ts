// Sayfa içerik TASLAKLARI. Köşeli parantezli alanlar ([ŞİRKET UNVANI] vb.) gerçek ticari bilgilerle doldurulmalıdır.
// Hukuki metinler genel çerçeve taslağıdır; yayına almadan önce bir hukuk uzmanı tarafından kontrol edilmelidir
// (6502 sayılı Tüketicinin Korunması Hakkında Kanun, Mesafeli Sözleşmeler Yönetmeliği, 6698 sayılı KVKK, 6563 sayılı e-Ticaret Kanunu).
// Biçim: "## " başlık, "- " madde, boş satır paragraf.

const SELLER = `- Unvan: [ŞİRKET UNVANI]
- Adres: [AÇIK ADRES]
- Telefon: [TELEFON]
- E-posta: [E-POSTA]
- MERSİS / Vergi no: [MERSİS NO] / [VERGİ DAİRESİ – VERGİ NO]
- KEP adresi: [KEP ADRESİ]`;

export const PAGE_DRAFTS: Record<string, string> = {
  hakkimizda: `Öner Yapı Market; inşaat, tadilat ve bakım işleri için hırdavat, el aletleri, elektrik ve tesisat malzemeleri, boya ve yapı kimyasallarını Türkiye'nin 81 iline kargo ile ulaştırır.

## Neler sunuyoruz
- Ustalar ve ev kullanıcıları için seçilmiş ürün yelpazesi
- Ağır ve hacimli ürünler için ayrı kargo planlaması
- Ürün sayfalarında doğrulanmış teknik bilgiler

## Firma bilgileri
${SELLER}`,

  iletisim: `Sorularınız, sipariş ve iade talepleriniz için bize ulaşabilirsiniz.

## İletişim bilgileri
${SELLER}

## Çalışma saatleri
[HAFTA İÇİ SAAT ARALIĞI] — [CUMARTESİ SAAT ARALIĞI]

Sipariş durumunuzu "Sipariş takip" sayfasından sipariş numaranız ve e-posta adresinizle sorgulayabilirsiniz.`,

  "teslimat-ve-kargo": `## Teslimat bölgesi
Siparişler yalnız Türkiye sınırları içindeki adreslere kargo ile teslim edilir. Yurt dışı gönderim ve mağazadan teslim alma yapılmamaktadır.

## Kargo ücreti nasıl hesaplanır
- Standart ürünler aynı kolide birleştirilir; ücret kolinin ağırlığına veya desisine (en × boy × yükseklik / 3000) göre, hangisi büyükse ona göre hesaplanır.
- Ağır ürünler (ör. torba çimento, harç) ve hacimli ürünler (ör. uzun profiller) parça başına taşınır ve ayrı ücretlendirilir.
- Bir ürün hiçbir zaman iki kez ücretlendirilmez; ödeme sayfasında her paketin ücreti ayrı ayrı gösterilir.
- Belirlenen sepet tutarının üzerindeki siparişlerde standart ürünlerin kargosu ücretsizdir. Bu kampanya ağır ve hacimli ürünleri kapsamaz.

## Teslim süresi
Ürün sayfasında belirtilen hazırlık süresi sonunda kargoya verilir. Kargoya verildiğinde takip numarası sipariş takip sayfasında görünür.

## Teslim alırken
Paketi teslim almadan önce kontrol ediniz. Hasarlı pakette kargo görevlisine tutanak tutturunuz.`,

  "iade-ve-degisim": `## Cayma hakkı
Mesafeli Sözleşmeler Yönetmeliği uyarınca ürünü teslim aldığınız tarihten itibaren 14 gün içinde herhangi bir gerekçe göstermeden cayma hakkınızı kullanabilirsiniz.

## Nasıl iade edilir
- Cayma bildiriminizi [E-POSTA] adresine sipariş numaranızla iletin.
- Ürünü, faturası ile birlikte, kullanılmamış ve yeniden satılabilir durumda gönderin.
- İade bedeli, ürün tarafımıza ulaştıktan sonra en geç 14 gün içinde ödeme yaptığınız karta iade edilir.

## Cayma hakkının kullanılamadığı durumlar
Yönetmelikte sayılan istisnalar (ör. tüketicinin istekleri doğrultusunda kesilen, ölçüye göre hazırlanan ürünler; ambalajı açılmış ve sağlık/hijyen açısından iadesi uygun olmayan ürünler) için cayma hakkı kullanılamaz. [UYGULANACAK İSTİSNALARI HUKUK UZMANIYLA BELİRLEYİN]

## Ayıplı ürün
Ayıplı ürünlerde 6502 sayılı Kanun'daki seçimlik haklarınız saklıdır.`,

  kvkk: `Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi uyarınca veri sorumlusu sıfatıyla [ŞİRKET UNVANI] tarafından hazırlanmıştır.

## İşlenen kişisel veriler
- Kimlik ve iletişim: ad, soyad, e-posta, cep telefonu
- Teslimat ve fatura adresi
- Sipariş ve işlem bilgileri
- Ödeme işlem bilgileri (kart bilgileri sitemizde tutulmaz; ödeme kuruluşunca işlenir)
- İşlem güvenliği: IP adresi, oturum bilgileri

## İşleme amaçları ve hukuki sebepler
- Siparişin kurulması ve ifası (KVKK m.5/2-c)
- Yasal yükümlülükler: fatura, mesafeli satış kayıtları (m.5/2-ç)
- İşlem güvenliği ve dolandırıcılığın önlenmesi (m.5/2-f)
- Ticari elektronik ileti: yalnız açık rızanız varsa

## Aktarım
Kargo firmaları (teslimat), ödeme kuruluşu (ödeme), barındırma hizmeti sağlayıcısı ve yetkili kamu kurumlarıyla, amaçla sınırlı olarak paylaşılır. [YURT DIŞINA AKTARIM VARSA BELİRTİN]

## Haklarınız
KVKK m.11 kapsamındaki taleplerinizi [E-POSTA] veya [KEP ADRESİ] üzerinden iletebilirsiniz.

## Veri sorumlusu
${SELLER}`,

  "mesafeli-satis-sozlesmesi": `## 1. Taraflar
Satıcı:
${SELLER}

Alıcı: Sipariş sırasında bilgileri alınan üye.

## 2. Konu
Bu sözleşme, Alıcının internet sitesi üzerinden elektronik ortamda sipariş verdiği ürünlerin satışı ve teslimine ilişkin hak ve yükümlülükleri, 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümlerine göre düzenler.

## 3. Ürün, fiyat ve teslimat
Ürünlerin cinsi, adedi, KDV dahil satış fiyatı, kargo ücreti ve ödeme şekli sipariş özetinde ve ön bilgilendirme formunda yer alır. Teslimat yalnız Türkiye içindeki adreslere yapılır; teslim süresi 30 günü aşamaz.

## 4. Cayma hakkı
Alıcı, teslimden itibaren 14 gün içinde cayma hakkına sahiptir. Ayrıntılar İade ve Değişim Koşulları sayfasındadır.

## 5. Uyuşmazlık
Uyuşmazlıklarda Ticaret Bakanlığınca ilan edilen parasal sınırlar dahilinde Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.

[SÖZLEŞMENİN TAMAMI HUKUK UZMANI TARAFINDAN HAZIRLANMALI / ONAYLANMALIDIR]`,

  "on-bilgilendirme-formu": `## Satıcı bilgileri
${SELLER}

## Ürün ve fiyat
Siparişinizdeki ürünlerin temel nitelikleri, adetleri, KDV dahil fiyatları ve kargo ücreti ödeme sayfasındaki sipariş özetinde gösterilir.

## Ödeme ve teslimat
Ödeme kredi/banka kartı ile ödeme kuruluşunun güvenli sayfasında yapılır. Teslimat yalnız Türkiye içi adreslere kargo ile yapılır.

## Cayma hakkı
Teslimden itibaren 14 gün içinde cayma hakkınızı kullanabilirsiniz; istisnalar İade ve Değişim Koşulları sayfasında belirtilmiştir.

## Şikâyet ve itiraz
Şikâyetlerinizi [E-POSTA] adresine iletebilir, yasal sınırlar dahilinde Tüketici Hakem Heyetine başvurabilirsiniz.

[FORM İÇERİĞİ HUKUK UZMANI TARAFINDAN KONTROL EDİLMELİDİR]`,

  "gizlilik-politikasi": `Kişisel verilerinizin hangi amaçlarla işlendiği KVKK Aydınlatma Metninde açıklanmıştır. Kart bilgileriniz sitemizde saklanmaz.

[METİN HUKUK UZMANI TARAFINDAN TAMAMLANMALIDIR]`,

  "cerez-politikasi": `Sitemiz yalnız zorunlu çerezler kullanır: oturum (giriş), sepet ve güvenlik çerezleri. Analitik veya reklam çerezi kullanılmamaktadır. Bu durum değişirse açık rızanız alınacaktır.

[METİN HUKUK UZMANI TARAFINDAN KONTROL EDİLMELİDİR]`,

  "kullanim-kosullari": `Siteyi kullanarak bu koşulları kabul etmiş sayılırsınız. Ürün bilgileri üretici ve tedarikçi verilerine dayanır; görseller temsili olabilir.

[METİN HUKUK UZMANI TARAFINDAN TAMAMLANMALIDIR]`,
};

export const FAQ_DRAFTS: { group: string; q: string; a: string }[] = [
  { group: "Sipariş", q: "Siparişimi nasıl takip ederim?", a: "Sipariş takip sayfasında sipariş numaranız ve e-posta adresinizle sorgulayabilirsiniz. Kargoya verilen siparişlerde takip numarası da görünür." },
  { group: "Sipariş", q: "Üye olmadan sipariş verebilir miyim?", a: "Sipariş vermek için üyelik gerekir. Sepetinizi üye olmadan doldurabilirsiniz; giriş yaptığınızda sepetiniz hesabınıza aktarılır." },
  { group: "Kargo", q: "Hangi illere gönderim yapıyorsunuz?", a: "Türkiye'nin 81 iline kargo ile gönderim yapıyoruz. Yurt dışı gönderim ve mağazadan teslim alma yoktur." },
  { group: "Kargo", q: "Ağır ürünlerde kargo ücreti neden farklı?", a: "Çimento, harç gibi ağır ürünler ve uzun profiller gibi hacimli ürünler parça başına taşınır. Ücret ödeme sayfasında paket paket gösterilir." },
  { group: "Kargo", q: "Ücretsiz kargo var mı?", a: "Belirlenen sepet tutarının üzerindeki siparişlerde standart ürünlerin kargosu ücretsizdir. Bazı ürünlerde ise ürün sayfasında belirtildiği şekilde kargo her zaman ücretsizdir." },
  { group: "Ödeme", q: "Hangi ödeme yöntemlerini kabul ediyorsunuz?", a: "Kredi ve banka kartı ile ödeme alınır. Kart bilgileriniz sitemizde girilmez ve saklanmaz; ödeme, ödeme kuruluşunun güvenli sayfasında yapılır." },
  { group: "İade", q: "Ürünü nasıl iade ederim?", a: "Teslimden itibaren 14 gün içinde iade talebinizi iletebilirsiniz. Ayrıntılar İade ve Değişim Koşulları sayfasındadır." },
];

/** Kategori SEO başlığı ve açıklaması (seed, yalnız boş alanları doldurur). Ürün bilgisi uydurmaz, yalnız kategori adlarını kullanır. */
export function categorySeo(name: string, children: string[], parent?: string) {
  const title = `${name}${parent ? ` – ${parent}` : ""} | Öner Yapı Market`.slice(0, 70);
  const list = children.slice(0, 3).join(", ");
  const description = (
    parent
      ? `${name} ürünlerini ${parent} kategorisinde inceleyin. Türkiye'nin 81 iline kargo, güvenli ödeme.`
      : `${name}: ${list}${children.length > 3 ? " ve daha fazlası" : ""}. Türkiye'nin 81 iline kargo, güvenli ödeme.`
  ).slice(0, 170);
  return { title, description };
}
