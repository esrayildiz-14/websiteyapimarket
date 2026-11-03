// Yetki taraması: yönetim panelindeki her sunucu işlemi (server action) ilk iş olarak oturum + yetki kontrolü yapmalı.
// Ekrandan değil doğrudan çağrılsa bile yetkisiz işlem yapılamaz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /actions\.ts$/.test(n) ? [p] : [];
  });
}

const PUBLIC_ADMIN_ACTIONS = new Set(["loginAction", "verifyMfaAction", "logoutAction"]); // giriş öncesi işlemler

test("admin klasöründeki her sunucu işlemi requireStaff ile başlar", () => {
  const offenders: string[] = [];
  let count = 0;
  for (const f of files("src/app/admin")) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /^"use server";/, `${f} "use server" ile başlamalı`);
    const re = /export async function (\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
    for (const m of src.matchAll(re)) {
      count++;
      const [, name, body] = m;
      if (PUBLIC_ADMIN_ACTIONS.has(name)) continue;
      const first = body.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("//")) ?? "";
      if (!/await requireStaff\(/.test(first)) offenders.push(`${f}: ${name}`);
    }
  }
  assert.ok(count > 20, `beklenenden az işlem bulundu (${count})`);
  assert.deepEqual(offenders, []);
});
