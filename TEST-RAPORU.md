# Test raporu — 02.11.2026

Ortam: Windows, Node 26, PostgreSQL 18 (yerel), Next.js 15.5 (geliştirme sunucusu), Google Chrome (Playwright).
Testler ayrı `oner_yapi_test` veritabanında çalışır; gerçek veritabanına dokunmaz. Ödeme adımı yalnız test veritabanında
etkinleşen sahte sağlayıcıyla doğrulanmıştır; **gerçek iyzico çağrısı yapılmamıştır** (anahtar yok).

| Kontrol | Sonuç |
|---|---|
| Tip kontrolü (`tsc --noEmit`) | Hatasız |
| Birim testleri (`npm run test:unit`) | 32 / 32 |
| Uçtan uca testler (`npm run test:e2e`) | 54 / 54 (son tam çalıştırmada 52 geçti; kalan 2 test, test kodundaki zamanlama/saat dilimi düzeltmesinden sonra ayrıca çalıştırılıp geçti) |
| Üretim derlemesi (`next build`) | Başarılı; ortak ilk yükleme JS 103 kB |
| Performans (üretim sunucusu, yerel) | Tüm ölçülen sayfalarda p95 ≤ 330 ms (ölçüm ürün sayısı az iken yapıldı; gerçek katalogla tekrarlanmalı) |

## Kapsanan senaryolar

- **Yönetim girişi:** yetkisiz erişim, hatalı şifre, 5 denemede kilit, httpOnly oturum, rol bazlı yetki.
- **Ürün:** tüm alanlarla ekleme + görsel, aynı kod engeli, düzenleme (fiyat/stok/durum), silme–geri alma, sitede görünürlük.
- **Kategori / marka:** ekleme, iki seviye sınırı, ürünlü kategori silme engeli, pasif kategorinin ürünleri gizlemesi, sıralama, marka silme kuralları.
- **Fiyat / stok:** tekil fiyat, toplu fiyat (önizleme + onay), stok giriş/çıkış/sayım, eksi stok ve ayrılmış stok koruması, kritik stok.
- **Kargo:** 81 il/973 ilçe/73.305 mahalle, karma profil (standart + ağır) ücreti, ürüne özel ücretsiz kargo, sepet eşiği (ağır yüke uygulanmaz), birim testlerinde çift ücretlendirme olmadığının ispatı, gönderi durumu, takip no, bildirim e-postası (kayda).
- **Satış:** sepete ekle / adet / sil, stok sınırı, üyelik, adres (posta kodu–il doğrulaması), sözleşme onayı, başarısız ödeme, eksik tutarlı ödeme, başarılı ödeme (stok düşer, gönderi oluşur), aynı ödeme sonucunun tekrarında stok ikinci kez düşmez, 30 dk ödeme süresi dolunca stok ayırmasının bırakılması, kupon, admin iptali ile stok iadesi.
- **İçerik / SEO:** banner, hukuki sayfa onay akışı, SSS + yapılandırılmış veri, kategori SEO ve görseli, ürün JSON-LD, sitemap, robots.
- **Excel içe aktarma:** şablon, kontrol (kayıt yapmaz), içe aktarma, doğrulanmamış ürünün pasif kaydı, hatalı satırın atlanması.
- **Görünüm:** masaüstü (1440), tablet (820), mobil (Pixel 7) — yatay taşma yok, sepete ekleme çalışıyor.
- **Güvenlik:** güvenlik başlıkları, oturumsuz admin uç noktaları, sahte çerez, XSS kaçışı, SQL enjeksiyonu denemesi, başkasının siparişini görme engeli, açık yönlendirme engeli, yükleme klasörü dışına erişim engeli.

## Test edilmeyenler / kapsam dışı

- Gerçek iyzico (sandbox dahil) çağrısı — anahtarlar sağlanınca sandbox'ta denenmeli.
- Gerçek e-posta gönderimi, kargo firması API'si, e-fatura.
- Yük testi (eşzamanlı çok kullanıcı) ve Lighthouse erişilebilirlik puanı.
