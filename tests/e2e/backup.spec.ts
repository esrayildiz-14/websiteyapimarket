// Faz 4 / P0: yedek durumu yönetim panelinde izlenir (hiç yok / eski / başarısız / tamam).
import { test, expect } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { login, STAFF } from "./helpers";

test.describe.configure({ mode: "serial" });
const DIR = "storage/test-yedek";
const write = (v: object) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/son-durum.json`, JSON.stringify(v));
};

test.afterAll(() => rmSync(DIR, { recursive: true, force: true }));

test("yedek hiç alınmadıysa, eskiyse veya başarısızsa yöneticiye uyarı; güncelse uyarı yok", async ({ page }) => {
  rmSync(DIR, { recursive: true, force: true });
  await login(page);
  await page.goto("/admin");
  await expect(page.getByTestId("backup-warning")).toContainText("Henüz yedek alınmadı");

  write({ ok: true, zaman: new Date(Date.now() - 30 * 3600_000).toISOString() });
  await page.reload();
  await expect(page.getByTestId("backup-warning")).toContainText("26 saatten eski");

  write({ ok: false, hata: "pg_dump başarısız (kod 1).", zaman: new Date().toISOString() });
  await page.reload();
  await expect(page.getByTestId("backup-warning")).toContainText("BAŞARISIZ");
  await expect(page.getByTestId("backup-warning")).toContainText("pg_dump başarısız");

  write({ ok: true, zaman: new Date().toISOString() });
  await page.reload();
  await expect(page.getByTestId("backup-warning")).toHaveCount(0);
});

test("yedek uyarısı yetkisiz personele gösterilmez", async ({ page }) => {
  rmSync(DIR, { recursive: true, force: true });
  await login(page, STAFF);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-user")).toBeVisible();
  await expect(page.getByTestId("backup-warning")).toHaveCount(0);
});
