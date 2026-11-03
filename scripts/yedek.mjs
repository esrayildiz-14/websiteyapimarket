// Tam yedek: veritabanı (pg_dump, tutarlı anlık görüntü) + yüklenen görseller + doğrulama bilgisi (manifest).
//   node scripts/yedek.mjs                → yedekler/<tarih>/ klasörüne yazar
//   YEDEK_KOPYA_DIR=D:\Yedek ...          → ayrıca bu klasöre (harici disk / bulut klasörü) kopyalar
//   YEDEK_SAKLA_GUN=7 / _HAFTA=4 / _AY=6  → saklama politikası (varsayılan 7 günlük, 4 haftalık, 6 aylık)
// Son durum yedekler/son-durum.json'a yazılır; yönetim paneli bunu okuyup uyarı gösterir.
import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dosyaOzetleri, pgConn, tabloSayilari, zamanDamgasi } from "./yedek-ortak.mjs";

const KOK = resolve(process.env.YEDEK_DIR || "yedekler");
const durum = (veri) => {
  mkdirSync(KOK, { recursive: true });
  writeFileSync(join(KOK, "son-durum.json"), JSON.stringify({ ...veri, zaman: new Date().toISOString() }, null, 2));
};

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL tanımlı değil.");
  const conn = pgConn(raw);
  const basla = Date.now();
  const klasor = join(KOK, zamanDamgasi());
  mkdirSync(klasor, { recursive: true });

  // 1) Tutarlı anlık görüntü: sayımlar ve pg_dump aynı snapshot'ı görür.
  const client = new pg.Client({ connectionString: conn.url(conn.db) });
  await client.connect();
  let sayilar;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snap = (await client.query("SELECT pg_export_snapshot() AS s")).rows[0].s;
    sayilar = await tabloSayilari(client);
    const r = spawnSync("pg_dump", [...conn.args, "-Fc", "--no-owner", `--snapshot=${snap}`, "-f", join(klasor, "veritabani.dump"), conn.db], {
      env: conn.env, stdio: ["ignore", "inherit", "inherit"],
    });
    if (r.status !== 0) throw new Error(`pg_dump başarısız (kod ${r.status ?? r.error?.message}).`);
    await client.query("COMMIT");
  } finally {
    await client.end();
  }

  // 2) Görseller
  const uploads = resolve(process.env.UPLOAD_DIR || "storage/uploads");
  const dosyalar = existsSync(uploads) ? dosyaOzetleri(uploads) : {};
  if (existsSync(uploads)) cpSync(uploads, join(klasor, "uploads"), { recursive: true });

  const manifest = { surum: 1, veritabani: conn.db, tablolar: sayilar, dosyaSayisi: Object.keys(dosyalar).length, dosyalar, sureMs: Date.now() - basla };
  writeFileSync(join(klasor, "manifest.json"), JSON.stringify(manifest, null, 2));

  // 3) Sunucudan bağımsız kopya
  const kopya = process.env.YEDEK_KOPYA_DIR;
  if (kopya) {
    mkdirSync(kopya, { recursive: true });
    cpSync(klasor, join(kopya, klasor.split(/[\\/]/).pop()), { recursive: true });
  }

  budama();
  durum({ ok: true, klasor, kopya: kopya || null, sureMs: manifest.sureMs, tablolar: sayilar, dosyaSayisi: manifest.dosyaSayisi });
  console.log(`YEDEK_TAMAM ${klasor} (${manifest.sureMs} ms, ${Object.values(sayilar).reduce((a, b) => a + b, 0)} satır, ${manifest.dosyaSayisi} dosya)`);
}

/** Saklama: son N günün tümü + her haftanın ve ayın son yedeği. Hem ana hem kopya klasöründe uygulanır. */
function budama() {
  const gun = Number(process.env.YEDEK_SAKLA_GUN || 7), hafta = Number(process.env.YEDEK_SAKLA_HAFTA || 4), ay = Number(process.env.YEDEK_SAKLA_AY || 6);
  for (const kok of [KOK, process.env.YEDEK_KOPYA_DIR].filter(Boolean)) {
    const yedekler = readdirSync(kok)
      .filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n) && statSync(join(kok, n)).isDirectory())
      .sort()
      .reverse();
    const tut = new Set();
    const gunler = new Map(), haftalar = new Map(), aylar = new Map();
    for (const n of yedekler) {
      const d = new Date(n.slice(0, 10));
      const g = n.slice(0, 10), a = n.slice(0, 7);
      const h = `${d.getUTCFullYear()}-${Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 6048e5)}`;
      if (!gunler.has(g)) gunler.set(g, n);
      if (!haftalar.has(h)) haftalar.set(h, n);
      if (!aylar.has(a)) aylar.set(a, n);
    }
    [...gunler.values()].slice(0, gun).forEach((n) => tut.add(n));
    [...haftalar.values()].slice(0, hafta).forEach((n) => tut.add(n));
    [...aylar.values()].slice(0, ay).forEach((n) => tut.add(n));
    for (const n of yedekler) if (!tut.has(n)) rmSync(join(kok, n), { recursive: true, force: true });
  }
}

main().catch((e) => {
  durum({ ok: false, hata: String(e?.message || e) });
  console.error("YEDEK_HATA", e?.message || e);
  process.exit(1);
});
