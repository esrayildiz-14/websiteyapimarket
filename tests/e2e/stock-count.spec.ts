// Faz 3 / P0-4: stok sayımı ekranı — barkod okutma (okuyucu klavye gibi yazıp Enter'a basar), fark raporu, onay.
import { test, expect } from "@playwright/test";
import { insertProduct, login, q, STAFF } from "./helpers";

test.describe.configure({ mode: "serial" });
const sub = async () => (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
let countId = "";
let p: { id: string; sku: string };
let barcode = "";

test("sayım başlatılır; barkod okutulup Enter'a basılınca adet artar, fiyat görünür, alan temizlenir", async ({ page }) => {
  p = await insertProduct({ categoryId: await sub(), stock: 10, price: 75 });
  barcode = "29" + String(Date.now()).slice(-10) + "7";
  await q(`UPDATE products SET barcode = $1 WHERE id = $2`, [barcode, p.id]);
  await q(`UPDATE stock_counts SET status = 'CANCELLED' WHERE "warehouseId" = 'wh_merkez' AND status IN ('OPEN','SUBMITTED')`);
  await login(page);
  await page.goto("/admin/sayim");
  await page.getByTestId("count-start-form").locator('[name="warehouseId"]').selectOption("wh_merkez");
  await page.getByTestId("count-start").click();
  await expect(page.getByTestId("count-status")).toHaveText("Sayım sürüyor");
  countId = page.url().split("/admin/sayim/")[1].split("?")[0];

  const input = page.getByLabel("Barkod");
  for (let i = 0; i < 3; i++) {
    await input.fill(barcode);
    await input.press("Enter");
    await expect(page.getByTestId("scan-ok")).toContainText(`sayılan ${i + 1}`);
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
  }
  await expect(page.getByTestId("scan-ok")).toContainText("75,00 ₺");
  await input.fill("OLMAYAN-BARKOD");
  await input.press("Enter");
  await expect(page.getByTestId("scan-error")).toContainText("eşleşen ürün yok");
  expect((await q<{ quantity: number }>(`SELECT quantity FROM inventory WHERE "productId" = $1`, [p.id]))[0].quantity).toBe(10);
});

test("adedi ayarla kipi ve fark raporu", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/sayim/${countId}`);
  const f = page.getByTestId("scan-form");
  await f.locator('[name="mode"]').selectOption("set");
  await f.locator('[name="quantity"]').fill("8");
  await page.getByLabel("Barkod").fill(p.sku);
  await page.getByLabel("Barkod").press("Enter");
  await expect(page.getByTestId("scan-ok")).toContainText("sayılan 8");
  await page.reload();
  const row = page.getByTestId(`count-line-${p.sku}`);
  await expect(row.getByTestId("system")).toHaveText("10");
  await expect(row.getByTestId("counted")).toHaveText("8");
  await expect(row.getByTestId("diff")).toHaveText("-2");
  await expect(page.getByTestId("sum-minus")).toHaveText("-2");
});

test("onaya gönder → onayla: stok düzeltilir, hareket sayıma bağlı, sipariş personeli erişemez", async ({ page, browser }) => {
  await login(page);
  await page.goto(`/admin/sayim/${countId}`);
  await page.getByTestId("count-submit").click();
  await expect(page.getByTestId("count-status")).toHaveText("Onay bekliyor");
  await expect(page.getByTestId("scan-form")).toHaveCount(0);
  await page.getByTestId("count-approve").click();
  await expect(page.getByTestId("count-status")).toHaveText("Onaylandı");
  await expect(page.getByTestId("flash-ok")).toContainText("1 üründe stok düzeltildi");
  expect((await q<{ quantity: number }>(`SELECT quantity FROM inventory WHERE "productId" = $1`, [p.id]))[0].quantity).toBe(8);
  const mv = await q<{ type: string; quantity: number }>(`SELECT type::text, quantity FROM inventory_movements WHERE "stockCountId" = $1`, [countId]);
  expect(mv).toEqual([{ type: "ADJUSTMENT", quantity: -2 }]);

  const ctx = await browser.newContext();
  const staff = await ctx.newPage();
  await login(staff, STAFF);
  await staff.goto("/admin/sayim");
  await expect(staff).toHaveURL(/\/admin\?hata=/);
  await ctx.close();
});
