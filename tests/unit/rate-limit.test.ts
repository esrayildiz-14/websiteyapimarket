import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketFor, clientIpFrom, contentSecurityPolicy, FixedWindowLimiter, ruleFor } from "../../src/lib/rate-limit";

test("pencere içinde sınır aşılınca reddedilir, pencere dolunca sıfırlanır", () => {
  const l = new FixedWindowLimiter();
  const rule = { limit: 3, windowMs: 60_000 };
  const t0 = 1_000_000;
  assert.deepEqual([1, 2, 3].map(() => l.hit("a", rule, t0).ok), [true, true, true]);
  const r = l.hit("a", rule, t0 + 10_000);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.retryAfterSec, 50);
  assert.equal(l.hit("b", rule, t0 + 10_000).ok, true); // başka anahtar etkilenmez
  assert.equal(l.hit("a", rule, t0 + 60_000).ok, true); // yeni pencere
});

test("bellek sınırında eski kayıtlar temizlenir", () => {
  const l = new FixedWindowLimiter(2);
  const rule = { limit: 1, windowMs: 1000 };
  l.hit("a", rule, 0);
  l.hit("b", rule, 0);
  assert.equal(l.hit("c", rule, 5000).ok, true);
  assert.equal(l.hit("a", rule, 5000).ok, true);
});

test("istek kovaları", () => {
  assert.equal(bucketFor("GET", "/api/adres"), "adres");
  assert.equal(bucketFor("POST", "/sepet"), "post");
  assert.equal(bucketFor("GET", "/arama"), "arama");
  assert.equal(bucketFor("GET", "/urun/x"), null);
});

test("sınırlar ortam değişkeniyle değiştirilebilir, geçersiz değer yok sayılır", () => {
  assert.equal(ruleFor("adres", { RATE_LIMIT_ADRES: "10" }).limit, 10);
  assert.equal(ruleFor("adres", { RATE_LIMIT_ADRES: "abc" }).limit, 240);
});

test("istemci IP: X-Forwarded-For'un istemcinin yazdığı sol tarafına güvenilmez", () => {
  const h = (xff: string | null) => (n: string) => (n === "x-forwarded-for" ? xff : null);
  assert.equal(clientIpFrom(h("6.6.6.6, 10.0.0.1"), {}), "10.0.0.1");
  assert.equal(clientIpFrom(h("6.6.6.6, 203.0.113.9, 10.0.0.1"), { TRUST_PROXY_HOPS: "1" }), "203.0.113.9");
  assert.equal(clientIpFrom(h("10.0.0.1"), { TRUST_PROXY_HOPS: "3" }), "10.0.0.1");
  assert.equal(clientIpFrom(h(null), {}), "yerel");
});

test("CSP: betikler nonce ile; canlıda unsafe-eval yok, http→https yükseltmesi var", () => {
  const prod = contentSecurityPolicy("abc", false);
  assert.match(prod, /script-src 'self' 'nonce-abc' 'strict-dynamic'(;|$)/);
  assert.doesNotMatch(prod, /unsafe-eval/);
  assert.match(prod, /frame-ancestors 'none'/);
  assert.match(prod, /object-src 'none'/);
  assert.match(prod, /upgrade-insecure-requests/);
  assert.match(contentSecurityPolicy("abc", true), /unsafe-eval/);
});
