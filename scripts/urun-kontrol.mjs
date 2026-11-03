// Gerçek veritabanındaki ürünlerin sitede neden görünüp görünmediğini listeler (yalnız okur).
import pg from "pg";
import "dotenv/config";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`
  SELECT p.sku, p.name, p.status::text AS durum, p."deletedAt" IS NOT NULL AS silinmis,
         cat.name AS kategori, cat."isActive" AS kategori_aktif, par.name AS ust_kategori, par."isActive" AS ust_aktif,
         COALESCE(i.quantity, -1) AS stok, COALESCE(i.reserved, 0) AS ayrilan, p."createdAt"
  FROM products p
  JOIN categories cat ON cat.id = p."categoryId"
  LEFT JOIN categories par ON par.id = cat."parentId"
  LEFT JOIN inventory i ON i."productId" = p.id
  ORDER BY p."createdAt" DESC LIMIT 30`);
console.log("URUN_SAYISI=" + r.rowCount);
for (const x of r.rows) {
  const neden = [];
  if (x.durum !== "ACTIVE") neden.push("PASIF");
  if (x.silinmis) neden.push("SILINMIS");
  if (!x.kategori_aktif) neden.push("KATEGORI_PASIF");
  if (x.ust_kategori && !x.ust_aktif) neden.push("UST_KATEGORI_PASIF");
  if (x.stok < 0) neden.push("ENVANTER_KAYDI_YOK");
  console.log(JSON.stringify({ sku: x.sku, ad: x.name, durum: x.durum, kategori: `${x.ust_kategori ?? ""}/${x.kategori}`, stok: x.stok, ayrilan: x.ayrilan, sitedeGorunur: neden.length === 0, neden }));
}
const db = await c.query("select current_database() db");
console.log("VERITABANI=" + db.rows[0].db);
await c.end();
