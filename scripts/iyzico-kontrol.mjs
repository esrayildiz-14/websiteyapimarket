// iyzico anahtar biçimini kontrol eder. Anahtarların kendisini YAZDIRMAZ; yalnız başlangıcı, uzunluğu ve biçim sorunlarını gösterir.
import "dotenv/config";
import { readFileSync } from "node:fs";
const raw = readFileSync(".env", "utf8");
const show = (name) => {
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(name + "="));
  const v = process.env[name] ?? "";
  const problems = [];
  if (!line) problems.push("satir yok");
  if (line && (line.match(/=/g) || []).length > 1 && !line.includes('"')) problems.push("tirnak yok");
  if (v !== v.trim()) problems.push("basta/sonda bosluk");
  if (/\s/.test(v.trim())) problems.push("icinde bosluk");
  if (/["']/.test(v)) problems.push("icinde tirnak isareti");
  console.log(`${name}: uzunluk=${v.length} sandbox_mi=${v.startsWith("sandbox-")} sorunlar=${problems.join(",") || "yok"}`); // anahtarın hiçbir karakteri yazdırılmaz
  return v.trim();
};
const k = show("IYZICO_API_KEY");
const s = show("IYZICO_SECRET_KEY");
console.log(`IYZICO_BASE_URL="${process.env.IYZICO_BASE_URL ?? ""}"`);
const lines = raw.split(/\r?\n/).filter((l) => l.includes("IYZICO")).length;
console.log("IYZICO_satir_sayisi=" + lines);
// sandbox'a kimlik doğrulamalı basit istek (BIN sorgu) — ödeme yapmaz
if (k && s) {
  const { createHmac } = await import("node:crypto");
  const base = (process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com").replace(/\/$/, "");
  const path = "/payment/bin/check";
  const body = JSON.stringify({ locale: "tr", conversationId: "kontrol", binNumber: "552879" });
  const rnd = Date.now() + "123456789";
  const sig = createHmac("sha256", s).update(rnd + path + body).digest("hex");
  const auth = Buffer.from(`apiKey:${k}&randomKey:${rnd}&signature:${sig}`).toString("base64");
  const r = await fetch(base + path, { method: "POST", headers: { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": rnd, "Content-Type": "application/json" }, body });
  const j = await r.json();
  console.log("SANDBOX_YANITI:", JSON.stringify({ status: j.status, errorCode: j.errorCode, errorMessage: j.errorMessage, bankName: j.bankName }));
}
