// Veritabanında saklanan gizli değerler (ör. 2FA anahtarı) için AES-256-GCM şifreleme.
// Anahtar: APP_ENCRYPTION_KEY = 32 baytın base64 hâli (ör. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY 32 baytlık base64 değer olmalı.");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("APP_ENCRYPTION_KEY tanımlı değil; canlıda zorunludur.");
  return createHash("sha256").update("oner-yapi-gelistirme-anahtari-canlida-kullanilmaz").digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Şifreli değer biçimi geçersiz.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
