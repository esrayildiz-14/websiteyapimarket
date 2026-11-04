// Basit yük testi: verilen adreslere N eşzamanlı istemciyle belirli süre istek atar; p50/p95/p99, istek/sn ve hata oranını ölçer.
//   node scripts/yuk-testi.mjs <taban-url> <eşzamanlı> <saniye> <yol1> [yol2 ...]
// Sonuç JSON olarak yazdırılır. Yalnız test / hazırlık ortamında kullanılır; canlı siteye uygulanmaz.
const [base, concArg, secArg, ...paths] = process.argv.slice(2);
if (!base || !paths.length) { console.error("Kullanım: node scripts/yuk-testi.mjs <url> <eşzamanlı> <sn> <yol...>"); process.exit(2); }
const conc = Number(concArg) || 50, secs = Number(secArg) || 10;
const end = Date.now() + secs * 1000;
const lat = [];
let ok = 0, fail = 0;
const codes = {};
async function worker(i) {
  let k = i;
  while (Date.now() < end) {
    const path = paths[k++ % paths.length];
    const t = performance.now();
    try {
      const r = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
      await r.arrayBuffer();
      codes[r.status] = (codes[r.status] ?? 0) + 1;
      if (r.status < 400) ok++; else fail++;
    } catch (e) {
      fail++;
      codes[e.name] = (codes[e.name] ?? 0) + 1;
    }
    lat.push(performance.now() - t);
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: conc }, (_, i) => worker(i)));
const dur = (Date.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const pct = (p) => Math.round(lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))] ?? 0);
const out = {
  concurrency: conc, seconds: secs, paths, requests: lat.length, rps: Math.round(lat.length / dur),
  ok, fail, errorRate: lat.length ? Math.round((fail / lat.length) * 10000) / 100 : 0,
  p50: pct(50), p95: pct(95), p99: pct(99), max: Math.round(lat[lat.length - 1] ?? 0), avg: Math.round(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)), codes,
};
console.log(JSON.stringify(out));
