# Öner Yapı Market — Canlıya alma rehberi

Bu belge sitenin yayına alınması için gereken adımları sırayla listeler. **Kalın** işaretli maddeler tamamlanmadan gerçek satış başlatılmamalıdır.

## 0. Canlı öncesi zorunlu kararlar ve onaylar (kod dışı)

| # | Konu | Durum |
|---|------|-------|
| C-01 | **Hukuki metinler** (KVKK aydınlatma metni, mesafeli satış sözleşmesi, ön bilgilendirme formu, iade, çerez, gizlilik, kullanım koşulları) bir **hukuk uzmanı** tarafından kontrol edilip admin panelinde "uzman onaylı" işaretlenmeli. Taslaklardaki köşeli parantezli alanlar ([ŞİRKET UNVANI], [MERSİS NO] vb.) gerçek bilgilerle doldurulmalı. | Yapılmadı |
| C-02 | **Ticari bilgiler**: şirket unvanı, adres, vergi/MERSİS no, KEP adresi, iletişim bilgileri; ETBİS (Elektronik Ticaret Bilgi Sistemi) kaydı. | Sağlanmadı |
| C-03 | **iyzico üye işyeri başvurusu** ve canlı anahtarlar. T.C. kimlik no gönderimi (şu an test değeri gönderiliyor, bkz. ASM-PAY-01) iyzico ve mali müşavirle netleştirilmeli. | Sandbox hazır, canlı yok |
| C-04 | **Kargo firması anlaşması** (tarife, takip bağlantısı şablonu, gerekiyorsa API). Admin → Kargo yönetimi → tarifeler gerçek anlaşmaya göre güncellenmeli. | Yapılmadı (manuel kargo çalışır) |
| C-05 | **E-fatura / e-arşiv** entegrasyonu (mali müşavir ile). Bu sürümde fatura kesilmez. | Kapsam dışı |
| C-06 | **E-posta gönderim servisi** (SMTP veya e-posta API). Şu an bildirimler yalnız kayda yazılır. | Yapılmadı |
| C-07 | Ürün içerikleri: teknik özellikler yalnız üretici/tedarikçi belgesiyle doğrulanmış bilgilerden girilmeli; görsellerin kullanım hakkı olmalı. | Devam ediyor |

## 1. Sunucu ve alan adı

- Node.js 20 LTS veya üstü, PostgreSQL 16 veya üstü (yönetilen veritabanı önerilir, otomatik yedekli).
- Alan adı + HTTPS sertifikası (Let's Encrypt veya barındırma sağlayıcısının sertifikası). Site yalnız HTTPS üzerinden yayınlanmalı.
- Önerilen: uygulama sunucusunun önünde ters vekil (Nginx/Caddy) veya Vercel/Render gibi bir platform. Not: yüklenen görseller `UPLOAD_DIR` klasöründe tutulur; sunucusuz platformlarda kalıcı disk yoksa nesne depolamaya (S3 uyumlu) geçilmeli (`src/lib/storage.ts` tek değişecek dosyadır).

## 2. Ortam değişkenleri (.env)

`.env.example` dosyasını `.env` olarak kopyalayın ve doldurun:

- `DATABASE_URL` — canlı veritabanı (güçlü şifre, yalnız uygulama sunucusundan erişim).
- `SITE_URL`, `PUBLIC_BASE_URL` — `https://alanadiniz.com.tr`. **Tanımlanmazsa robots.txt siteyi arama motorlarına kapatır.**
- `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL=https://api.iyzipay.com` — yalnız canlı anahtarlar geldiğinde. Boşsa sandbox kullanılır; sandbox'ta gerçek tahsilat olmaz.
- `UPLOAD_DIR` — kalıcı ve yedeklenen bir klasör.
- `PAYMENT_TEST_PROVIDER` **canlıda tanımlanmamalı** (zaten yalnız `_test` veritabanında ve geliştirme modunda çalışır).
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — ilk yönetici; ilk girişten sonra şifreyi değiştirin.

## 3. Kurulum komutları

```bash
npm ci
npx prisma migrate deploy      # migration dosyalarını uygular (veri silmez)
npm run db:seed                # rolleri, kategorileri, 81 il/ilçe/mahalleyi, taslak içerikleri yükler (tekrar çalıştırmak güvenli)
npm run build                  # prisma generate + next build
npm start                      # 3000 portunda
```

Süreç yöneticisi (pm2/systemd) ile `npm start` sürekli çalışır tutulmalı.

## 4. iyzico canlı geçiş adımları

1. iyzico üye işyeri panelinde canlı API anahtarlarını alın, `.env`'e yazın, `IYZICO_BASE_URL=https://api.iyzipay.com`.
2. Geri dönüş adresi: `https://alanadiniz.com.tr/api/odeme/iyzico` (uygulama bunu otomatik gönderir; `PUBLIC_BASE_URL` doğru olmalı).
3. Önce küçük tutarlı gerçek bir siparişle uçtan uca deneme yapın; iyzico panelinde ödemeyi ve iadeyi kontrol edin.
4. İade/iptal: bu sürümde iyzico iade API'si bağlı değildir. Admin siparişi iptal ettiğinde stok geri alınır, para iadesi **iyzico panelinden** yapılır.

## 5. Yayın öncesi kontrol listesi

- [ ] Admin → Site içerikleri → Sayfalar: tüm hukuki sayfalar "Uzman onaylı" ve yayında.
- [ ] Admin → Kargo yönetimi: tarifeler, ücretsiz kargo sınırı, kargo firmaları ve takip bağlantıları gerçek bilgilerle.
- [ ] Admin → Kategoriler: SEO başlık/açıklamaları gözden geçirildi.
- [ ] Ürünler: en az bir ürün aktif, fiyat/stok/ölçü doğru, görseller yüklü.
- [ ] Varsayılan yönetici şifresi değiştirildi; kullanılmayan personel hesapları kapalı.
- [ ] `https://alanadiniz.com.tr/robots.txt` sitemap satırını gösteriyor; `sitemap.xml` açılıyor.
- [ ] Google Search Console'a site ve sitemap eklendi.
- [ ] Veritabanı yedeği otomatik (günlük) ve geri yükleme denendi.
- [ ] `npm run test:unit` ve test ortamında `npm run test:e2e` başarılı.

## 6. İşletim

- Ödeme bekleyen siparişlerin stok ayırması 30 dakika sonra otomatik bırakılır (sepet, ödeme ve admin sipariş sayfası açıldığında temizlenir).
- Kritik stok: Admin → Stok yönetimi → Kritik stok.
- Bildirim e-postaları: Admin → Kargo yönetimi → Bildirim e-postaları (e-posta servisi bağlanana kadar gönderilmez).
- Denetim kaydı: tüm admin işlemleri `audit_logs` tablosuna yazılır.

## 7. Bilinen sınırlamalar (bu sürüm)

- E-fatura, e-posta gönderimi, kargo API'si, iyzico iade API'si, taksit seçenekleri bağlı değil.
- Misafir (üyeliksiz) sipariş yok; sepet üyeliksiz doldurulabilir.
- Ürün varyantları veritabanında hazır, admin arayüzü sonraki sürümde.
