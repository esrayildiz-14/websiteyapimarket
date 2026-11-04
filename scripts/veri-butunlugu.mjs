// Veri bütünlüğü denetimi — YALNIZ OKUR, hiçbir kaydı değiştirmez (işlem READ ONLY açılır).
// Kullanım: node scripts/veri-butunlugu.mjs            → .env'deki DATABASE_URL
//           VERI_DB_URL=postgres://... node scripts/veri-butunlugu.mjs
// Çıkış kodu: 0 = hata yok (uyarılar olabilir), 1 = en az bir HATA bulundu.
import "dotenv/config";
import pg from "pg";

const url = process.env.VERI_DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL tanımlı değil.");
  process.exit(2);
}

/** [seviye, başlık, sorgu] — sorgu sorunlu satırları döndürür (en çok 20). */
const KONTROLLER = [
  ["HATA", "Negatif stok (inventory)", `SELECT id, "productId", "variantId", quantity, reserved FROM inventory WHERE quantity < 0 OR reserved < 0`],
  ["HATA", "Negatif depo stoğu", `SELECT s.id, w.code, s."inventoryId", s.quantity FROM warehouse_stocks s JOIN warehouses w ON w.id = s."warehouseId" WHERE s.quantity < 0`],
  ["HATA", "Satılabilir stok, online depoların toplamına eşit değil",
    `SELECT i.id, i."productId", i.quantity, sum(s.quantity) FILTER (WHERE w."sellsOnline")::int AS depo_toplami
       FROM inventory i JOIN warehouse_stocks s ON s."inventoryId" = i.id JOIN warehouses w ON w.id = s."warehouseId"
      GROUP BY i.id HAVING i.quantity <> coalesce(sum(s.quantity) FILTER (WHERE w."sellsOnline"), 0)`],
  ["UYARI", "Ayrılan adet stoktan fazla (ödeme bekleyen sipariş varken stok azaltılmış)", `SELECT id, "productId", quantity, reserved FROM inventory WHERE reserved > quantity`],
  ["HATA", "Envanter kaydı ürün de varyant da değil / ikisi birden", `SELECT id FROM inventory WHERE ("productId" IS NULL) = ("variantId" IS NULL)`],
  ["UYARI", "Yayındaki ürünün stok kaydı yok", `SELECT p.id, p.sku FROM products p LEFT JOIN inventory i ON i."productId" = p.id WHERE p.status = 'ACTIVE' AND i.id IS NULL AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v."productId" = p.id)`],
  ["HATA", "Negatif veya sıfır fiyatlı yayındaki ürün", `SELECT id, sku, price FROM products WHERE status = 'ACTIVE' AND price <= 0`],
  ["HATA", "İndirimli fiyat liste fiyatından yüksek/eşit", `SELECT id, sku, price, "salePrice" FROM products WHERE "salePrice" IS NOT NULL AND "salePrice" >= price`],
  ["HATA", "Sipariş satırı tutarı ≠ birim fiyat × adet", `SELECT id, "orderId", "unitPrice", quantity, "lineTotal" FROM order_items WHERE abs("unitPrice" * quantity - "lineTotal") > 0.01`],
  ["HATA", "Sipariş ara toplamı ≠ satırların toplamı",
    `SELECT o."orderNumber", o.subtotal, sum(i."lineTotal") AS satirlar FROM orders o JOIN order_items i ON i."orderId" = o.id GROUP BY o.id HAVING abs(o.subtotal - sum(i."lineTotal")) > 0.01`],
  ["HATA", "Sipariş genel toplamı ≠ ara toplam − indirim + kargo", `SELECT "orderNumber", subtotal, "discountTotal", "shippingTotal", "grandTotal" FROM orders WHERE abs(subtotal - "discountTotal" + "shippingTotal" - "grandTotal") > 0.01`],
  ["HATA", "Satırı olmayan sipariş", `SELECT o."orderNumber" FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i."orderId" = o.id)`],
  ["HATA", "Ödendi/hazırlanıyor/kargoda/teslim siparişte başarılı kart ödemesi yok",
    `SELECT o."orderNumber", o.status FROM orders o WHERE o."paymentMethod" = 'CARD' AND o.status IN ('PAID','PREPARING','SHIPPED','DELIVERED')
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p."orderId" = o.id AND p.status = 'SUCCESS')`],
  ["HATA", "Başarılı ödeme tutarı sipariş toplamından farklı (geç gelen ödeme hariç)",
    `SELECT o."orderNumber", o."grandTotal", p.amount FROM payments p JOIN orders o ON o.id = p."orderId" WHERE p.status = 'SUCCESS' AND abs(p.amount - o."grandTotal") > 0.01`],
  ["UYARI", "Aynı siparişte birden çok başarılı ödeme (çift tahsilat şüphesi — iade gerekebilir)",
    `SELECT o."orderNumber", count(*)::int FROM payments p JOIN orders o ON o.id = p."orderId" WHERE p.status = 'SUCCESS' GROUP BY o.id HAVING count(*) > 1`],
  ["UYARI", "Süresi geçmiş ama hâlâ ödeme bekleyen sipariş (mutabakat çalışmamış olabilir)",
    `SELECT "orderNumber", "reservationExpiresAt" FROM orders WHERE status = 'PENDING_PAYMENT' AND "reservationExpiresAt" < now() - interval '1 hour'`],
  ["HATA", "Satın almada teslim alınan > sipariş edilen", `SELECT id, "purchaseOrderId", quantity, "receivedQty" FROM purchase_order_items WHERE "receivedQty" > quantity OR "receivedQty" < 0`],
  ["HATA", "Satın alma satırında teslim alınan ≠ mal kabul belgelerinin toplamı",
    `SELECT i.id, i."receivedQty", coalesce(sum(g.quantity), 0)::int AS belgeler FROM purchase_order_items i LEFT JOIN goods_receipt_items g ON g."purchaseOrderItemId" = i.id
      GROUP BY i.id HAVING i."receivedQty" <> coalesce(sum(g.quantity), 0)`],
  ["HATA", "Kasa satışında iade toplamı satış tutarını aşıyor", `SELECT number, "grandTotal", "refundedTotal" FROM store_sales WHERE "refundedTotal" > "grandTotal" + 0.005`],
  ["HATA", "Tamamlanan kasa satışında tahsilat < satış tutarı",
    `SELECT s.number, s."grandTotal", coalesce(sum(p.amount), 0) AS tahsilat FROM store_sales s LEFT JOIN store_payments p ON p."storeSaleId" = s.id
      WHERE s.status = 'COMPLETED' GROUP BY s.id HAVING coalesce(sum(p.amount), 0) + s."refundedTotal" + 0.005 < s."grandTotal"`],
  ["UYARI", "Birden fazla varsayılan depo", `SELECT count(*)::int FROM warehouses WHERE "isDefault" HAVING count(*) > 1`],
  ["HATA", "Varsayılan depo yok", `SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE "isDefault")`],
  ["UYARI", "Aynı adla kayıtlı birden fazla müşteri e-postası (büyük/küçük harf farkı)",
    `SELECT lower(email) AS email, count(*)::int FROM users GROUP BY lower(email) HAVING count(*) > 1`],
  ["UYARI", "Aktif ürünün kategorisi pasif", `SELECT p.sku, c.slug FROM products p JOIN categories c ON c.id = p."categoryId" WHERE p.status = 'ACTIVE' AND NOT c."isActive"`],
];

const client = new pg.Client({ connectionString: url });
await client.connect();
let hata = 0, uyari = 0;
try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  for (const [seviye, baslik, sql] of KONTROLLER) {
    let rows;
    try {
      rows = (await client.query(`SELECT * FROM (${sql}) x LIMIT 20`)).rows;
    } catch (e) {
      console.log(`[ATLANDI] ${baslik}: ${e.message}`);
      await client.query("ROLLBACK");
      await client.query("BEGIN TRANSACTION READ ONLY");
      continue;
    }
    if (!rows.length) {
      console.log(`[TAMAM]  ${baslik}`);
      continue;
    }
    if (seviye === "HATA") hata++; else uyari++;
    console.log(`[${seviye}] ${baslik} — ${rows.length}${rows.length === 20 ? "+" : ""} kayıt`);
    for (const r of rows.slice(0, 5)) console.log("         " + JSON.stringify(r));
  }
  // Bilgi: hangi e-posta şablonları üretildi (gönderim yapılandırılmadıysa hepsi LOGGED olmalı)
  const mails = (await client.query(`SELECT template, status, count(*)::int AS adet FROM email_logs GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
  console.log("\nE-posta kayıtları (şablon / durum / adet):");
  for (const m of mails) console.log(`  ${m.template} / ${m.status} / ${m.adet}`);
  const sizinti = (await client.query(`SELECT count(*)::int AS n FROM email_logs WHERE body ~ 'sifre-yenile\\?t=[A-Za-z0-9_-]{20,}'`)).rows[0].n;
  if (sizinti && process.env.EMAIL_LOG_SECRETS !== "1") {
    hata++;
    console.log(`[HATA] ${sizinti} e-posta kaydında açık şifre sıfırlama bağlantısı var`);
  } else if (sizinti) console.log(`  (test ortamı: ${sizinti} kayıtta sıfırlama bağlantısı bilerek açık — EMAIL_LOG_SECRETS=1)`);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
console.log(`\nVERI_BUTUNLUGU hata=${hata} uyari=${uyari}`);
process.exit(hata ? 1 : 0);
