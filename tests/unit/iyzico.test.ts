import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { authHeaders, iyzPrice, responseSignature, sigPrice } from "../../src/lib/iyzico-sign";

test("iyzico fiyat biçimi", () => {
  assert.equal(iyzPrice(1250.5), "1250.5");
  assert.equal(iyzPrice(100), "100.0");
  assert.equal(iyzPrice(99.999), "100.0");
  assert.equal(sigPrice("50.00"), "50");
  assert.equal(sigPrice("12.50"), "12.5");
  assert.equal(sigPrice(1160), "1160");
});

test("IYZWSv2 başlığı: randomKey + yol + gövde HMAC-SHA256, base64 yetki dizesi", () => {
  const h = authHeaders("api-x", "secret-y", "/payment/bin/check", '{"binNumber":"589004"}', "1722246017090123456789");
  const decoded = Buffer.from(h.Authorization.replace("IYZWSv2 ", ""), "base64").toString();
  const sig = createHmac("sha256", "secret-y").update('1722246017090123456789/payment/bin/check{"binNumber":"589004"}').digest("hex");
  assert.equal(decoded, `apiKey:api-x&randomKey:1722246017090123456789&signature:${sig}`);
  assert.equal(h["x-iyzi-rnd"], "1722246017090123456789");
  assert.ok(h.Authorization.startsWith("IYZWSv2 "));
});

test("yanıt imzası alanları ':' ile birleştirir", () => {
  const s = responseSignature("k", ["SUCCESS", "1", "TRY", "b", "c", "50", "50", "t"]);
  assert.equal(s, createHmac("sha256", "k").update("SUCCESS:1:TRY:b:c:50:50:t").digest("hex"));
});
