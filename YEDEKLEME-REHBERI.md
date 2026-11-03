# Yedekleme ve Geri Yükleme Rehberi

## Ne yedeklenir
- **Veritabanı** (PostgreSQL): ürünler, kategoriler, müşteriler, adresler, siparişler, ödemeler, stok ve stok hareketleri, depolar, kampanyalar, içerikler, denetim kayıtları. `pg_dump` tutarlı anlık görüntü (snapshot) ile alınır; yedek sırasında gelen siparişler yedeği bozmaz.
- **Yüklenen dosyalar** (`UPLOAD_DIR`, varsayılan `storage/uploads`): ürün, marka, banner görselleri.
- **Doğrulama bilgisi** (`manifest.json`): kritik tabloların satır sayıları ve her dosyanın sha256 özeti.

`.env` (gizli anahtarlar) bilerek yedeğe **dahil edilmez**. Ayrı ve güvenli bir yerde (ör. parola yöneticisi) saklayın.

## Komutlar
| İş | Komut |
| --- | --- |
| Yedek al | `node scripts/yedek.mjs` |
| Günlük otomatik yedeği kur (Windows) | `scripts\yedek-zamanla.cmd 12:30` |
| Yedeği doğrula (yeni veritabanına geri yükle + karşılaştır) | `node scripts/geri-yukle.mjs yedekler\<klasör> oner_yapi_dogrulama storage\geri-yukleme-testi` |

Ortam değişkenleri (.env):
- `YEDEK_KOPYA_DIR` — sunucudan bağımsız kopya klasörü (harici disk, ağ diski veya bilgisayarda eşitlenen bulut klasörü). **Ayarlanmadan yedek aynı diskte kalır.**
- `YEDEK_SAKLA_GUN` (7), `YEDEK_SAKLA_HAFTA` (4), `YEDEK_SAKLA_AY` (6) — saklama politikası.

## Saklama politikası (varsayılan)
Son 7 günün her günü, son 4 haftanın her biri, son 6 ayın her biri tutulur; daha eskiler silinir. Yaklaşık 17 yedek.

## İzleme
Her çalışma `yedekler/son-durum.json` dosyasına sonucu yazar. Yönetim paneli ana sayfası, yedek **hiç alınmadıysa**, **26 saatten eskiyse** veya **başarısız olduysa** Super Admin'e uyarı gösterir. E-posta bildirimi, e-posta servisi bağlandığında eklenecek.

## Geri yükleme testi
GitHub'daki otomatik testler her gönderimde: yedek alır → yeni bir veritabanına geri yükler → tablo sayılarını ve dosya özetlerini karşılaştırır → süreyi ölçer. Uyuşmazlıkta test kırmızı olur.

## Hedefler (öneri — ölçümle güncellenecek)
| Hedef | Değer | Durum |
| --- | --- | --- |
| RPO (en fazla veri kaybı) | 24 saat (günlük yedek) | Günlük otomatik yedek kurulunca sağlanır |
| RTO (yeniden çalışır hâle gelme) | 2 saat | Geri yükleme süresi testte ölçülüyor; sunucu kurulumu dahil edilince kesinleşir |

Daha düşük RPO (ör. 1 saat) için sürekli WAL arşivleme gerekir; canlı sunucu seçildikten sonra maliyetiyle birlikte değerlendirilir.

## Felaket durumunda geri dönüş (canlı veritabanını değiştirme)
1. Siteyi bakım moduna alın / sunucuyu durdurun (yeni sipariş gelmesin).
2. Mevcut (bozuk) veritabanının da bir yedeğini alın — hiçbir şeyi silmeyin.
3. `geri-yukle.mjs` ile yedeği **yeni** bir veritabanına yükleyin; çıktıda `GERI_YUKLEME_TAMAM` ve uyuşmazlık olmadığını görün.
4. `.env` içindeki `DATABASE_URL`'i yeni veritabanına çevirin; görselleri `UPLOAD_DIR`'e kopyalayın.
5. Siteyi açın; son siparişleri, stokları ve ödemeleri kontrol edin. Yedekten sonraki siparişler için iyzico panelindeki ödemelerle karşılaştırın.
6. Olayı tarih, neden, kayıp süre ve yapılanlarla kayda geçirin.

Bu işlem canlı sistemi değiştirdiği için yetkili onayı olmadan yapılmaz.
