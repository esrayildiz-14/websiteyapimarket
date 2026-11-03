// Başlangıç verisi — SRS bölüm 4 kategori ağacı ve bölüm 9 kargo profilleri.
// Kargo fiyatları ÖRNEKTİR (ASM-02): kargo anlaşması yapılınca admin panelinden güncellenir.

export const CATEGORY_TREE: { name: string; profile: "STD" | "AGIR" | "HACIM"; children: string[] }[] = [
  { name: "Elektrikli El Aletleri", profile: "STD", children: ["Matkaplar", "Akülü Vidalamalar", "Taşlama Makineleri", "Testereler", "Kırıcı ve Deliciler", "Zımpara ve Polisaj Makineleri", "Akü ve Şarj Cihazları"] },
  { name: "El Aletleri", profile: "STD", children: ["Tornavidalar", "Pense ve Kargaburunlar", "Anahtar Takımları", "Çekiç ve Balyozlar", "Maket Bıçakları ve Kesiciler", "Ölçü Aletleri ve Su Terazileri", "Mala, Spatula ve Sıva Aletleri", "El Testereleri"] },
  { name: "Hırdavat ve Bağlantı Elemanları", profile: "STD", children: ["Vidalar", "Civata, Somun ve Pul", "Dübeller", "Çiviler ve Bağ Teli", "Kilitler ve Asma Kilitler", "Menteşe ve Kapı Donanımı", "Bantlar", "Matkap Uçları ve Bits Uçlar", "Kesici ve Taşlama Diskleri", "Kaynak Elektrodları"] },
  { name: "Elektrik Malzemeleri", profile: "STD", children: ["Elektrik Kabloları", "Priz ve Anahtarlar", "Sigorta ve Kaçak Akım Röleleri", "Elektrik Panoları", "Aydınlatma", "Uzatma Kabloları ve Grup Prizler"] },
  { name: "Tesisat Malzemeleri", profile: "STD", children: ["PPRC Boru ve Ek Parçaları", "PVC Atık Su Boruları ve Ek Parçaları", "Vanalar ve Çekvalfler", "Flatör ve Rezervuar İç Takımları", "Sifonlar ve Yer Süzgeçleri", "Musluk Bağlantı Ekipmanları", "Sızdırmazlık Malzemeleri", "Su Depoları", "Rögar Kapakları ve Drenaj Kanalları"] },
  { name: "Vitrifiye ve Banyo", profile: "HACIM", children: ["Klozetler ve Klozet Kapakları", "Lavabolar", "Eviyeler", "Armatür ve Bataryalar", "Duş Setleri", "Banyo Mobilyaları", "Banyo Aksesuarları ve Havlupanlar", "Taharet ve Bahçe Muslukları", "Hela Taşları"] },
  { name: "Boya ve Boya Malzemeleri", profile: "STD", children: ["İç Cephe Boyaları", "Tavan Boyaları", "Dış Cephe Boyaları", "Astarlar", "Macunlar", "Sentetik ve Ahşap Boyaları", "Sprey Boyalar", "Tiner ve Solventler", "Fırça ve Rulolar", "Maskeleme ve Koruma Malzemeleri"] },
  { name: "Yapı Kimyasalları ve Yalıtım", profile: "STD", children: ["Seramik Yapıştırıcıları", "Derz Dolguları", "Su Yalıtım Ürünleri", "Silikon ve Mastikler", "Poliüretan Köpükler", "Hızlı Yapıştırıcılar", "Isı ve Ses Yalıtımı", "Sıva Fileleri"] },
  { name: "İnşaat Malzemeleri", profile: "AGIR", children: ["Çimento", "Kireç", "Hazır Harç ve Sıvalar", "Alçı Ürünleri", "Alçıpan Levhalar", "Alçıpan Profil ve Ekipmanları", "Kutu Profiller", "Gazbeton", "İnşaat Ekipmanları ve Mastarlar", "Naylon Branda ve Örtüler"] },
  { name: "Kum, Çakıl ve Doğal Taş", profile: "AGIR", children: ["Kum (0-3, Mil)", "Silis ve Kuvars Kum", "Dere Çakılı", "Kırma Taş", "Mermer ve Taş Tozu", "Mozaik", "Akvaryum ve Oyun Kumları"] },
  { name: "Seramik ve Zemin Aksesuarları", profile: "HACIM", children: ["Fayans Bitim ve Basamak Profilleri", "Fayans İç ve Dış Köşe Profilleri", "Derz Artıları ve Seviye Klipsleri", "Parke Eşik ve Geçiş Profilleri", "Süpürgelikler"] },
  { name: "Dekorasyon", profile: "HACIM", children: ["Strafor Tuğla Duvar Panelleri", "Stropiyer ve Kartonpiyer", "Lamba Göbekleri", "Tavan Kaplama", "Dekoratif Mermer Setleri"] },
  { name: "Bahçe ve Dış Mekan", profile: "STD", children: ["Barbekü ve Mangallar", "Barbekü, Şömine ve Soba Aksesuarları", "Beton Çeşmeler", "Beton Çiçeklikler", "Bahçe Hortumları ve Bağlantıları", "Kürek, Çapa ve Tırmıklar", "Sinek Telleri", "Bahçe Temizlik Ürünleri"] },
  { name: "Ateş Tuğlası ve Refrakter", profile: "AGIR", children: ["Ateş Tuğlaları", "Dekoratif Tuğlalar", "Şamot ve Refrakter Harçlar", "Seramik Yünü ve Battaniyeler", "Pizza ve Pişirme Taşları", "Fırın ve Şömine Camları", "Traverten ve Patlatma Taşlar"] },
  { name: "İş Güvenliği", profile: "STD", children: ["İş Eldivenleri", "İş Ayakkabıları", "Koruyucu Gözlük ve Maskeler", "Baretler", "İş Kıyafetleri"] },
  { name: "Taşıma, Depolama ve Ambalaj", profile: "STD", children: ["Merdivenler", "El ve Taşıma Arabaları", "Leğen, Kova ve Elekler", "Streç Film ve Ambalaj", "Boş Çuvallar"] },
];

export const SHIPPING_PROFILES = [
  {
    code: "STD", name: "Standart", packing: "COMBINED" as const, baseIncludes: 0, basePrice: 120, unitPrice: 0,
    freeShippingEligible: true, transitDaysMin: 1, transitDaysMax: 3, deliveryNote: "Kapıya teslim.", sortOrder: 0,
    tiers: [
      { min: 0, max: 5, price: 120 }, { min: 5, max: 10, price: 160 }, { min: 10, max: 20, price: 220 },
      { min: 20, max: 30, price: 290 }, { min: 30, max: 50, price: 400 },
    ],
  },
  {
    code: "AGIR", name: "Ağır", packing: "PER_PIECE" as const, baseIncludes: 30, basePrice: 180, unitPrice: 8,
    freeShippingEligible: false, transitDaysMin: 3, transitDaysMax: 7, deliveryNote: "Bina önüne teslim, kat çıkışı dahil değildir.", sortOrder: 1, tiers: [],
  },
  {
    code: "HACIM", name: "Hacimli", packing: "PER_PIECE" as const, baseIncludes: 30, basePrice: 160, unitPrice: 6,
    freeShippingEligible: false, transitDaysMin: 3, transitDaysMax: 7, deliveryNote: "Bina önüne teslim, kat çıkışı dahil değildir.", sortOrder: 2, tiers: [],
  },
];

export const BRANDS = ["Bosch", "Filli Boya", "Marshall", "Dyo", "Polisan", "ECA", "VitrA", "Weber", "Knauf", "Kalekim", "Fırat", "Sista"];

export const CARGO_COMPANIES = [
  { name: "Yurtiçi Kargo", agreementNote: "Anlaşma yapılmadı" },
  { name: "Aras Kargo", agreementNote: "Anlaşma yapılmadı" },
  { name: "MNG Kargo", agreementNote: "Anlaşma yapılmadı" },
];

export const PAGES: { slug: string; title: string; type: "CORPORATE" | "LEGAL" }[] = [
  { slug: "hakkimizda", title: "Hakkımızda", type: "CORPORATE" },
  { slug: "iletisim", title: "İletişim", type: "CORPORATE" },
  { slug: "kvkk", title: "KVKK Aydınlatma Metni", type: "LEGAL" },
  { slug: "gizlilik-politikasi", title: "Gizlilik Politikası", type: "LEGAL" },
  { slug: "cerez-politikasi", title: "Çerez Politikası", type: "LEGAL" },
  { slug: "mesafeli-satis-sozlesmesi", title: "Mesafeli Satış Sözleşmesi", type: "LEGAL" },
  { slug: "on-bilgilendirme-formu", title: "Ön Bilgilendirme Formu", type: "LEGAL" },
  { slug: "iade-ve-degisim", title: "İade ve Değişim Koşulları", type: "LEGAL" },
  { slug: "teslimat-ve-kargo", title: "Teslimat ve Kargo Koşulları", type: "LEGAL" },
  { slug: "kullanim-kosullari", title: "Kullanım Koşulları", type: "LEGAL" },
];
