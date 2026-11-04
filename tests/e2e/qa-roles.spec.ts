// QA: personel ve rol yönetimi; her rol yalnız yetkili olduğu ekran ve işlemleri kullanabilir (arayüz + doğrudan istek).
import { test, expect } from "@playwright/test";
import { login, q, uniq } from "./helpers";

test.describe.configure({ mode: "serial" });
const depo = { email: `${uniq("depo").toLowerCase()}@oneryapi.local`, password: "Depo-Personel-2026" };

test("Super Admin depo personeli ekler; zayıf şifre ve geçersiz e-posta reddedilir; kendi hesabını pasife alamaz", async ({ page }) => {
  await login(page);
  await page.goto("/admin/personel");
  const f = page.getByTestId("staff-form");
  await f.locator('[name="email"]').fill("gecersiz");
  await f.locator('[name="firstName"]').fill("Depo");
  await f.locator('[name="lastName"]').fill("Görevlisi");
  await f.locator('[name="roleId"]').selectOption({ label: "Depo Personeli" });
  await f.locator('[name="password"]').fill("kisa");
  await page.getByTestId("staff-submit").click();
  await expect(page.getByTestId("err-email")).toBeVisible();
  await expect(page.getByTestId("err-password")).toBeVisible();
  await f.locator('[name="email"]').fill(depo.email);
  await f.locator('[name="password"]').fill(depo.password);
  await page.getByTestId("staff-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("Depo Personeli");

  const me = page.getByTestId("staff-row-test-admin@oneryapi.local");
  await me.getByLabel("test-admin@oneryapi.local aktif").uncheck();
  await me.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("flash-err")).toContainText("Kendi rolünüzü");
});

test("depo personeli depo ve sayım ekranlarını kullanır; finans, personel, fiyat, kasa ve sipariş ekranlarına giremez; rapor indirme 403", async ({ page }) => {
  await login(page, depo);
  for (const url of ["/admin/depolar", "/admin/sayim", "/admin/stok"]) {
    await page.goto(url);
    await expect(page, url).not.toHaveURL(/hata=/);
  }
  for (const url of ["/admin/raporlar", "/admin/personel", "/admin/fiyatlar", "/admin/kasa", "/admin/siparisler", "/admin/tedarikciler", "/admin/urunler/yeni", "/admin/kampanyalar"]) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/admin\?hata=/);
  }
  // Mal kabul için satın alma listesine girer ama alış tutarlarını görmez
  await page.goto("/admin/satin-alma");
  await expect(page.getByTestId("po-table")).toBeVisible();
  await expect(page.getByTestId("po-table")).not.toContainText("Toplam");
  expect((await page.request.get("/admin/rapor-indir?format=csv")).status()).toBe(403);
  expect((await page.request.get("/admin/sablon-urun", { maxRedirects: 0 })).status()).not.toBe(200);
});

test("pasife alınan personelin açık oturumu hemen kapanır", async ({ page, browser }) => {
  const staffCtx = await browser.newContext();
  const sp = await staffCtx.newPage();
  await login(sp, depo);
  await login(page);
  await page.goto("/admin/personel");
  const row = page.getByTestId(`staff-row-${depo.email}`);
  await row.getByLabel(`${depo.email} aktif`).uncheck();
  await row.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("flash-ok")).toContainText("oturumları kapatıldı");
  await sp.goto("/admin/depolar");
  await expect(sp).toHaveURL(/\/admin\/giris/);
  expect((await q<{ n: number }>(`SELECT count(*)::int n FROM sessions s JOIN users u ON u.id = s."userId" WHERE u.email = $1`, [depo.email]))[0].n).toBe(0);
  await staffCtx.close();
});
