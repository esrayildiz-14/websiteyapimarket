// Yedekten geri yükleme ve DOĞRULAMA. Var olan bir veritabanının ÜZERİNE YAZMAZ: yalnız yeni (boş) bir veritabanı oluşturur.
//   node scripts/geri-yukle.mjs <yedek-klasoru> <yeni_veritabani_adi> [gorsel_hedef_klasoru]
// Tablo satır sayıları ve görsel dosyalarının özetleri (sha256) yedek anındaki değerlerle karşılaştırılır; süre ölçülür.
// Canlı veritabanını bu yedekle değiştirmek ayrı ve onaylı bir işlemdir (KURTARMA-REHBERI.md).
import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dosyaOzetleri, pgConn, tabloSayilari } from "./yedek-ortak.mjs";

const [klasorArg, hedefDb, gorselHedef] = process.argv.slice(2);
if (!klasorArg || !hedefDb) {
  console.error("Kullanım: node scripts/geri-yukle.mjs <yedek-klasoru> <yeni_veritabani_adi> [gorsel_hedef_klasoru]");
  process.exit(2);
}
if (!/^[a-z0-9_]+$/.test(hedefDb)) { console.error("Veritabanı adı yalnız küçük harf, rakam ve _ içerebilir."); process.exit(2); }

async function main() {
  const basla = Date.now();
  const klasor = resolve(klasorArg);
  const manifest = JSON.parse(readFileSync(join(klasor, "manifest.json"), "utf8"));
  const raw = process.env.RESTORE_ADMIN_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL tanımlı değil.");
  const conn = pgConn(raw);
  if (hedefDb === conn.db || hedefDb === manifest.veritabani) throw new Error("Hedef, kullanılan veya yedeği alınan veritabanıyla aynı olamaz.");

  const admin = new pg.Client({ connectionString: conn.url("postgres") });
  await admin.connect();
  try {
    const var_ = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [hedefDb]);
    if (var_.rowCount) throw new Error(`"${hedefDb}" zaten var. Üzerine yazılmaz; başka bir ad seçin.`);
    await admin.query(`CREATE DATABASE "${hedefDb}"`);
  } finally {
    await admin.end();
  }

  const r = spawnSync("pg_restore", [...conn.args, "--no-owner", "--exit-on-error", "-d", hedefDb, join(klasor, "veritabani.dump")], {
    env: conn.env, stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) throw new Error(`pg_restore başarısız (kod ${r.status ?? r.error?.message}).`);

  const c = new pg.Client({ connectionString: conn.url(hedefDb) });
  await c.connect();
  const sayilar = await tabloSayilari(c);
  await c.end();
  const farklar = Object.entries(manifest.tablolar).filter(([t, n]) => sayilar[t] !== n).map(([t, n]) => `${t}: yedek ${n}, geri yüklenen ${sayilar[t] ?? "yok"}`);

  let dosyaFark = [];
  if (gorselHedef && existsSync(join(klasor, "uploads"))) {
    cpSync(join(klasor, "uploads"), resolve(gorselHedef), { recursive: true });
    const ozet = dosyaOzetleri(resolve(gorselHedef));
    dosyaFark = Object.entries(manifest.dosyalar).filter(([p, h]) => ozet[p] !== h).map(([p]) => p);
  }

  const sure = Date.now() - basla;
  const sonuc = { hedefDb, sureMs: sure, tablolar: sayilar, farklar, dosyaFark, dosyaSayisi: manifest.dosyaSayisi };
  console.log(JSON.stringify(sonuc, null, 2));
  if (farklar.length || dosyaFark.length) { console.error("GERI_YUKLEME_UYUSMAZLIK"); process.exit(1); }
  console.log(`GERI_YUKLEME_TAMAM ${hedefDb} ${sure} ms`);
}

main().catch((e) => { console.error("GERI_YUKLEME_HATA", e?.message || e); process.exit(1); });
