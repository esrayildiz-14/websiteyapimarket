// İstek hız sınırı (sabit pencere). Tek sunucu için bellekte tutulur; birden fazla sunucuya geçilince
// paylaşılan bir depoya (ör. Redis) taşınmalıdır. Saf fonksiyonlar birim testlerle doğrulanır.

export type Rule = { limit: number; windowMs: number };
export type Bucket = "post" | "adres" | "arama";

const DEFAULTS: Record<Bucket, Rule> = {
  post: { limit: 120, windowMs: 60_000 }, // form gönderimi / sunucu işlemi / API POST
  adres: { limit: 240, windowMs: 60_000 }, // adres sözlüğü (il, ilçe, mahalle)
  arama: { limit: 120, windowMs: 60_000 }, // ürün araması
};

export function ruleFor(bucket: Bucket, env: Record<string, string | undefined> = process.env): Rule {
  const v = Number(env[`RATE_LIMIT_${bucket.toUpperCase()}`]);
  return Number.isInteger(v) && v > 0 ? { ...DEFAULTS[bucket], limit: v } : DEFAULTS[bucket];
}

/** Hangi istek hangi kovaya sayılır (null = sınırsız). */
export function bucketFor(method: string, pathname: string): Bucket | null {
  if (pathname.startsWith("/api/adres")) return "adres";
  if (method === "POST") return "post";
  if (method === "GET" && pathname === "/arama") return "arama";
  return null;
}

type Entry = { start: number; count: number };

export class FixedWindowLimiter {
  private store = new Map<string, Entry>();
  constructor(private maxKeys = 50_000) {}

  /** İzin verilirse { ok: true }, aksi hâlde kaç saniye sonra tekrar denenebileceği. */
  hit(key: string, rule: Rule, now = Date.now()): { ok: true; remaining: number } | { ok: false; retryAfterSec: number } {
    let e = this.store.get(key);
    if (!e || now - e.start >= rule.windowMs) {
      if (this.store.size >= this.maxKeys) this.sweep(now, rule.windowMs);
      e = { start: now, count: 0 };
      this.store.set(key, e);
    }
    e.count++;
    if (e.count > rule.limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((e.start + rule.windowMs - now) / 1000)) };
    return { ok: true, remaining: rule.limit - e.count };
  }

  private sweep(now: number, windowMs: number) {
    for (const [k, v] of this.store) if (now - v.start >= windowMs) this.store.delete(k);
    if (this.store.size >= this.maxKeys) this.store.clear();
  }
}

/**
 * İstemci IP'si. X-Forwarded-For listesinin en sağındaki adres, sunucuya bağlanan taraftır (Next.js veya önündeki
 * ters vekil ekler). İstemcinin kendi yazdığı soldaki değerlere güvenilmez; aksi hâlde başlığı değiştirerek hız sınırını
 * ve giriş kilidini atlatabilir. Sitenin önünde N adet güvenilen vekil varsa TRUST_PROXY_HOPS=N ayarlanır.
 */
export function clientIpFrom(get: (name: string) => string | null, env: Record<string, string | undefined> = process.env): string {
  const list = (get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const hops = Math.max(0, Number(env.TRUST_PROXY_HOPS) || 0);
  const ip = list.length ? list[Math.max(0, list.length - 1 - hops)] : get("x-real-ip");
  return (ip || "yerel").slice(0, 64);
}

/** Content-Security-Policy. Betikler yalnız bu isteğe özel nonce ile çalışır. */
export function contentSecurityPolicy(nonce: string, dev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
