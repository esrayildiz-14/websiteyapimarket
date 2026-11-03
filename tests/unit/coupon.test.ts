import { test } from "node:test";
import assert from "node:assert/strict";
import { couponDiscount, type CouponRule } from "../../src/lib/coupon-rules";

const base: CouponRule = { type: "PERCENT", value: 10, minOrderTotal: null, maxDiscount: null, usageLimit: null, perUserLimit: null, usedCount: 0, startsAt: null, endsAt: null, isActive: true };

test("kupon: yüzde, tavan ve sabit tutar", () => {
  assert.deepEqual(couponDiscount(base, 1000, 0), { ok: true, discount: 100 });
  assert.deepEqual(couponDiscount({ ...base, maxDiscount: 50 }, 1000, 0), { ok: true, discount: 50 });
  assert.deepEqual(couponDiscount({ ...base, type: "FIXED", value: 1500 }, 1000, 0), { ok: true, discount: 1000 });
});

test("kupon: süre, limit ve alt tutar", () => {
  const now = new Date("2026-06-01");
  assert.equal(couponDiscount({ ...base, endsAt: new Date("2026-05-31") }, 1000, 0, now).ok, false);
  assert.equal(couponDiscount({ ...base, startsAt: new Date("2026-06-02") }, 1000, 0, now).ok, false);
  assert.equal(couponDiscount({ ...base, usageLimit: 5, usedCount: 5 }, 1000, 0).ok, false);
  assert.equal(couponDiscount({ ...base, perUserLimit: 1 }, 1000, 1).ok, false);
  assert.equal(couponDiscount({ ...base, minOrderTotal: 1500 }, 1000, 0).ok, false);
  assert.equal(couponDiscount({ ...base, isActive: false }, 1000, 0).ok, false);
});
