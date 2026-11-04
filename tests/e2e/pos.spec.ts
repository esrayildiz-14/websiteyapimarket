// Mağaza kasası ekranı: barkod okutunca ürün ve fiyat görünür, satış tamamlanınca stok düşer; iade.
import { test, expect } from "@playwright/test";
import { insertProduct, login, q, STAFF } from "./helpers";

test.describe.configure({ mode: "serial" });
const sub = async () => (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
const stock = async (id: string) => (await q<{ quantity: number }>(`SELECT quantity FROM inventory WHERE "productId" = $1`, [id]))[0].quantity;
let p: { id: string; sku: string };
let barcode = "";
let saleId = "";

test("barkod okutulunca ürün ve fiyat sepete gelir; ikinci okutma adedi artırır; eksik nakitte satış yapılamaz", async ({ page }) => {
  p = await insertProduct({ categoryId: await sub(), stock: 6, price: 149.9 });
  barcode = "29" + String(Date.now()).slice(-10) + "3";
  await q(`UPDATE products SET barcode = $1 WHERE id = $2`, [barcode, p.id]);
  await login(page);
  await page.goto("/admin/kasa");
  const scan = page.getByLabel("Barkod okut");
  await scan.fill(barcode);
  await scan.press("Enter");
  await expect(page.getByTestId("pos-ok")).toContainText("149,90 ₺");
  await expect(scan).toHaveValue("");
  await scan.fill(barcode);
  await scan.press("Enter");
  await expect(page.getByTestId(`pos-line-${p.sku}`).getByLabel(`${p.sku} adet`)).toHaveValue("2");
  await expect(page.getByTestId("pos-total")).toContainText("299,80");
  await scan.fill("OLMAYAN-123");
  await scan.press("Enter");
  await expect(page.getByTestId("pos-error")).toContainText("eşleşen ürün yok");
  await page.getByLabel("Alınan nakit").fill("200");
  await expect(page.getByTestId("pos-complete")).toBeDisabled();
  expect(await stock(p.id)).toBe(6);
});

test("satış tamamlanır: para üstü, stok düşer; fiş sayfası", async ({ page }) => {
  await login(page);
  await page.goto("/admin/kasa");
  const scan = page.getByLabel("Barkod okut");
  for (let i = 0; i < 2; i++) {
    await scan.fill(barcode);
    await scan.press("Enter");
    await expect(page.getByTestId(`pos-line-${p.sku}`).getByLabel(`${p.sku} adet`)).toHaveValue(String(i + 1));
  }
  await page.getByLabel("Alınan nakit").fill("300");
  await expect(page.getByTestId("pos-change")).toContainText("0,20");
  await page.getByTestId("pos-complete").click();
  await expect(page.getByTestId("pos-done")).toContainText("para üstü 0,20");
  expect(await stock(p.id)).toBe(4);
  await page.getByTestId("pos-done").getByRole("link", { name: "fiş / ayrıntı" }).click();
  await expect(page.getByTestId("sale-total")).toContainText("299,80");
  saleId = page.url().split("/admin/kasa/")[1].split("?")[0];
  await expect(page.getByTestId("receipt")).toContainText("mali değeri yoktur");
});

test("iade: 1 adet sağlam iade stoğa döner; iadeden sonra iptal seçeneği kalkar", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/kasa/${saleId}`);
  const f = page.getByTestId("return-form");
  await f.getByLabel(`${p.sku} iade adedi`).fill("1");
  await f.locator('[name="reason"]').fill("Müşteri vazgeçti");
  await page.getByTestId("return-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("149,90 ₺ iade kaydedildi");
  await expect(page.getByTestId(`sale-item-${p.sku}`).getByTestId("returned")).toHaveText("1");
  expect(await stock(p.id)).toBe(5);
  await expect(page.getByTestId("cancel-sale-form")).toHaveCount(0);
});

test("sipariş personeli kasaya giremez", async ({ page }) => {
  await login(page, STAFF);
  await page.goto("/admin/kasa");
  await expect(page).toHaveURL(/\/admin\?hata=/);
});
