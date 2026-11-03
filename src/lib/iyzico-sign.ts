import { createHmac, randomBytes } from "node:crypto";

/** iyzico fiyat biçimi: "1250.5", "100.0" (nokta ondalık, gereksiz sıfırsız, en az bir ondalık hane). */
export function iyzPrice(n: number) {
  const s = (Math.round(n * 100) / 100).toString();
  return s.includes(".") ? s : `${s}.0`;
}

/** İmza doğrulamasında fiyatların sondaki sıfırları atılır ("50.00" → "50", "12.50" → "12.5"). */
export function sigPrice(v: unknown) {
  const s = String(v ?? "");
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export function authHeaders(apiKey: string, secretKey: string, uriPath: string, body: string, randomKey = Date.now() + randomBytes(4).toString("hex")) {
  const signature = createHmac("sha256", secretKey).update(randomKey + uriPath + body).digest("hex");
  const auth = Buffer.from(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`).toString("base64");
  return { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": randomKey, "Content-Type": "application/json", Accept: "application/json" };
}

export function responseSignature(secretKey: string, parts: unknown[]) {
  return createHmac("sha256", secretKey).update(parts.map((p) => String(p ?? "")).join(":")).digest("hex");
}

