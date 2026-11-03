import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, hotp, newSecret, otpauthUri, verifyTotp } from "../../src/lib/totp";
import { open, seal } from "../../src/lib/secret-box";

// RFC 6238 Ek B test vektörleri (SHA1, anahtar "12345678901234567890", 8 hane)
const KEY = Buffer.from("12345678901234567890");
test("RFC 6238 test vektörleri", () => {
  const cases: [number, string][] = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"]];
  for (const [t, code] of cases) assert.equal(hotp(KEY, Math.floor(t / 30), 8), code, `t=${t}`);
});

test("base32 gidiş-dönüş ve RFC 4648 örneği", () => {
  assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.deepEqual(base32Decode("MZXW6YTBOI"), Buffer.from("foobar"));
  const s = newSecret();
  assert.equal(s.length, 32);
  assert.deepEqual(base32Encode(base32Decode(s)), s);
});

test("doğrulama: ±1 adım tolerans, eski adım ve aynı kod tekrar kabul edilmez, yanlış biçim reddedilir", () => {
  const secret = base32Encode(KEY);
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30000);
  const code = hotp(KEY, step);
  assert.equal(verifyTotp(secret, code, now), step);
  assert.equal(verifyTotp(secret, hotp(KEY, step - 1), now), step - 1);
  assert.equal(verifyTotp(secret, hotp(KEY, step - 2), now), null);
  assert.equal(verifyTotp(secret, code, now, step), null); // aynı kod ikinci kez
  assert.equal(verifyTotp(secret, "12345", now), null);
  assert.equal(verifyTotp(secret, "abcdef", now), null);
});

test("otpauth adresi doğrulama uygulamalarının beklediği biçimde", () => {
  assert.match(otpauthUri("ABC", "a@b.c"), /^otpauth:\/\/totp\/%C3%96ner%20Yap%C4%B1%20Market%3Aa%40b\.c\?secret=ABC&issuer=/);
});

test("gizli değer şifreleme: geri açılır, her seferinde farklı, kurcalanınca reddedilir", () => {
  const a = seal("GIZLI"), b = seal("GIZLI");
  assert.notEqual(a, b);
  assert.equal(open(a), "GIZLI");
  const parts = a.split(".");
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
  assert.throws(() => open(parts.join(".")));
});
