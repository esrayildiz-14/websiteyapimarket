// Raporlar ekranı ve dışa aktarma; yetkisiz erişim engeli.
import { test, expect } from "@playwright/test";
import { login, STAFF } from "./helpers";

test("rapor ekranı finansal özet ve tabloları gösterir; CSV ve Excel indirilir", async ({ page }) => {
  await login(page);
  await page.goto("/admin/raporlar?test=1&boyut=kanal");
  await expect(page.getByTestId("fin-summary")).toBeVisible();
  await expect(page.getByTestId("fin-commission")).toHaveText("Kayıt yok");
  await expect(page.getByTestId("dim-table")).toBeVisible();
  const csv = await page.request.get("/admin/rapor-indir?test=1&format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Tür;Anahtar;Adet");
  const xlsx = await page.request.get("/admin/rapor-indir?test=1&format=xlsx");
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK"); // xlsx = zip
});

test("raporlar yetkisiz personele kapalı (sayfa ve dışa aktarma)", async ({ page }) => {
  await login(page, STAFF);
  await page.goto("/admin/raporlar");
  await expect(page).toHaveURL(/\/admin\?hata=/);
  expect((await page.request.get("/admin/rapor-indir?format=csv")).status()).toBe(403);
});
