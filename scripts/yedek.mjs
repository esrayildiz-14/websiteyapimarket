// Veritabanı yedeği: .env içindeki DATABASE_URL ile pg_dump çalıştırır. Parolayı ekrana yazmaz.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const raw = process.env.DATABASE_URL;
if (!raw) { console.error("DATABASE_URL yok"); process.exit(1); }
const u = new URL(raw);
u.search = ""; // pg_dump ?schema=... parametresini kabul etmez
mkdirSync("yedekler", { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const file = `yedekler/${u.pathname.slice(1)}-${ts}.dump`;
const r = spawnSync("pg_dump", ["-Fc", "-f", file, "-d", u.toString()], { stdio: ["ignore", "inherit", "inherit"], shell: false });
if (r.status !== 0) { console.error("YEDEK_HATA"); process.exit(1); }
console.log("YEDEK_TAMAM " + file);
