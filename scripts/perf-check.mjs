// Üretim derlemesi üzerinde basit performans ölçümü.
// Kullanım: önce `next build` (NEXT_DIST_DIR=.next-prod), sonra: node scripts/perf-check.mjs
// Test veritabanına bağlanır; gerçek veritabanına dokunmaz.
import { spawn, execSync } from "node:child_process";
import pg from "pg";
import "dotenv/config";

const PORT = 3200;
const BASE = `http://localhost:${PORT}`;
const DB = process.env.TEST_DATABASE_URL;
if (!DB || !/_test(\?|$)/.test(DB)) throw new Error("TEST_DATABASE_URL _test veritabanı olmalı");

const env = { ...process.env, DATABASE_URL: DB, NEXT_DIST_DIR: ".next-prod", NODE_ENV: "production", PORT: String(PORT) };
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, shell: true, stdio: "ignore" });
const stop = () => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {}
};
process.on("exit", stop);

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE + "/sss")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Sunucu açılmadı");
}

async function measure(url, n = 12) {
  const times = [];
  let bytes = 0;
  let html = "";
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const res = await fetch(BASE + url);
    html = await res.text();
    times.push(performance.now() - t0);
    bytes = Buffer.byteLength(html);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
  }
  times.sort((a, b) => a - b);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  let js = 0;
  for (const s of new Set(scripts)) js += Buffer.byteLength(await (await fetch(new URL(s, BASE))).text());
  return { url, median: Math.round(times[Math.floor(n / 2)]), p95: Math.round(times[Math.floor(n * 0.95) - 1] ?? times[n - 1]), htmlKB: +(bytes / 1024).toFixed(1), jsKB: +(js / 1024).toFixed(1) };
}

const db = new pg.Client({ connectionString: DB });
await db.connect();
const cat = (await db.query(`SELECT slug FROM categories WHERE "parentId" IS NULL ORDER BY "sortOrder" LIMIT 1`)).rows[0]?.slug;
const prod = (await db.query(`SELECT slug FROM products WHERE status = 'ACTIVE' AND "deletedAt" IS NULL LIMIT 1`)).rows[0]?.slug;
const products = (await db.query(`SELECT count(*)::int n FROM products`)).rows[0].n;
await db.end();

await waitReady();
const urls = ["/", "/urunler", `/kategori/${cat}`, ...(prod ? [`/urun/${prod}`] : []), "/sss", "/sepet", "/giris"];
const rows = [];
for (const u of urls) rows.push(await measure(u));
console.log(`Ürün sayısı (test veritabanı): ${products}`);
console.table(rows);
const LIMIT_MS = 1000;
const slow = rows.filter((r) => r.p95 > LIMIT_MS);
console.log(slow.length ? `UYARI: p95 > ${LIMIT_MS} ms: ${slow.map((r) => r.url).join(", ")}` : `Tüm sayfalarda p95 ≤ ${LIMIT_MS} ms`);
stop();
process.exit(slow.length ? 1 : 0);
