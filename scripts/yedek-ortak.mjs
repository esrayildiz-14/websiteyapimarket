// Yedekleme ve geri yükleme için ortak yardımcılar. Parolayı komut satırına veya ekrana yazmaz (PGPASSWORD ortam değişkeni).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Yedeklenen ve geri yüklemede karşılaştırılan tablolar (iş açısından kritik veriler). */
export const KRITIK_TABLOLAR = [
  "users", "addresses", "categories", "brands", "products", "product_images", "product_variants",
  "inventory", "inventory_movements", "warehouses", "warehouse_stocks",
  "orders", "order_items", "payments", "shipments", "shipment_events", "order_status_history",
  "coupons", "discounts", "pages", "faqs", "audit_logs", "price_history", "_prisma_migrations",
];

/** postgresql://... adresini pg_dump/pg_restore argümanlarına ve ortamına çevirir. */
export function pgConn(rawUrl) {
  const u = new URL(rawUrl);
  const db = decodeURIComponent(u.pathname.slice(1));
  const args = ["-h", u.hostname || "localhost", "-p", u.port || "5432", "-U", decodeURIComponent(u.username || "postgres")];
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password || "") };
  return { db, args, env, url: (name) => { const c = new URL(rawUrl); c.pathname = "/" + encodeURIComponent(name); c.search = ""; return c.toString(); } };
}

export async function tabloSayilari(client) {
  const out = {};
  for (const t of KRITIK_TABLOLAR) {
    const exists = await client.query(`SELECT to_regclass($1) AS r`, [`public."${t}"`]);
    if (!exists.rows[0].r) continue;
    out[t] = Number((await client.query(`SELECT count(*)::bigint AS n FROM public."${t}"`)).rows[0].n);
  }
  return out;
}

/** Klasördeki dosyaların göreli yolu → sha256 listesi (görsel bütünlüğü kontrolü). */
export function dosyaOzetleri(dir) {
  const out = {};
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      const p = join(d, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else out[relative(dir, p).split("\\").join("/")] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

export function zamanDamgasi(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-").replace("Z", "");
}
