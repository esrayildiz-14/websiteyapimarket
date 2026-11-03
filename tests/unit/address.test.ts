import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, postalCodeProblem } from "../../src/lib/address";

test("posta kodu il plaka koduyla başlamalı", () => {
  assert.equal(postalCodeProblem("34710", 34), null);
  assert.equal(postalCodeProblem("06100", 6), null);
  assert.notEqual(postalCodeProblem("35100", 34), null);
  assert.notEqual(postalCodeProblem("3471", 34), null);
});

test("telefon normalleştirme", () => {
  assert.equal(normalizePhone("0532 123 45 67"), "05321234567");
  assert.equal(normalizePhone("+90 (532) 123-45-67"), "05321234567");
  assert.equal(normalizePhone("5321234567"), "05321234567");
  assert.equal(normalizePhone("0212 123 45 67"), null);
});
