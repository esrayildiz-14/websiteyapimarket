// Fiyat ve stok yönetimi — gerçek sunucu ve test veritabanı.
import { test, expect } from "@playwright/test";
import { insertProduct, login, q, uniq } from "./helpers";

async function subCategory() {
  return (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
}
const inv = async (productId: string) =>
  (await q<{ quantity: number; reserved: number; minStock: number }>(`SELECT quantity, reserved, "minStock" FROM inventory WHERE "productId" = $1`, [productId]))[0];

test("tek ürün fiyatı güncellenir, geçmişe yazılır, sitede görünür; hatalı indirim reddedilir", async ({ page }) => {
  const p = await insertProduct({ categoryId: await subCategory(), price: 500 });
  await login(page);
  await page.goto(`/admin/fiyatlar?q=${p.sku}`);
  const row = page.getByTestId(`price-row-${p.sku}`);
  await row.getByLabel("Satış fiyatı").fill("650,00");
  await row.getByLabel("İndirimli fiyat").fill("599,90");
  await row.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("flash-ok")).toContainText("fiyat güncellendi");
  const db = (await q<{ price: string; salePrice: string }>(`SELECT price::text, "salePrice"::text FROM products WHERE id = $1`, [p.id]))[0];
  expect(db).toEqual({ price: "650.00", salePrice: "599.90" });
  expect(await q(`SELECT 1 FROM price_history WHERE "productId" = $1`, [p.id])).toHaveLength(1);
  await page.goto(`/urun/${p.slug}`);
  await expect(page.getByTestId("product-price")).toContainText("599,90");

  await page.goto(`/admin/fiyatlar?q=${p.sku}`);
  await page.getByTestId(`price-row-${p.sku}`).getByLabel("İndirimli fiyat").fill("700");
  await page.getByTestId(`price-row-${p.sku}`).getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("flash-err")).toContainText("düşük olmalı");
});

test("toplu fiyat: önizleme fiyatı değiştirmez, onaylı gönderim değiştirir", async ({ page }) => {
  const brand = (await q<{ id: string }>(
    `INSERT INTO brands (id, name, slug, "isActive", "sortOrder", "createdAt", "updatedAt") VALUES ($1, $1, $1, true, 0, now(), now()) RETURNING id`,
    [uniq("toplu").toLowerCase()],
  ))[0].id;
  const cat = await subCategory();
  const a = await insertProduct({ categoryId: cat, brandId: brand, price: 100 });
  const b = await insertProduct({ categoryId: cat, brandId: brand, price: 250 });
  await login(page);
  await page.goto("/admin/fiyatlar");
  const form = page.getByTestId("bulk-form");
  await form.locator('[name="scope"]').selectOption("brand");
  await form.locator('[name="brandId"]').selectOption(brand);
  await form.locator('[name="op"]').selectOption("increase_pct");
  await form.locator('[name="amount"]').fill("10");
  await page.getByTestId("bulk-submit").click();
  await expect(page.locator(".flash.warn")).toContainText("2 tanesi değişecek");
  expect((await q<{ price: string }>(`SELECT price::text FROM products WHERE id = $1`, [a.id]))[0].price).toBe("100.00");

  await form.locator('[name="scope"]').selectOption("brand");
  await form.locator('[name="brandId"]').selectOption(brand);
  await form.locator('[name="op"]').selectOption("increase_pct");
  await form.locator('[name="amount"]').fill("10");
  await form.locator('[name="confirm"]').check();
  await page.getByTestId("bulk-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("2 ürünün fiyatı güncellendi");
  const prices = await q<{ price: string }>(`SELECT price::text FROM products WHERE id = ANY($1) ORDER BY price`, [[a.id, b.id]]);
  expect(prices.map((r) => r.price)).toEqual(["110.00", "275.00"]);
});

test("stok girişi, çıkışı ve sayım hareket kaydıyla işlenir; stok eksiye düşmez", async ({ page }) => {
  const p = await insertProduct({ categoryId: await subCategory(), stock: 10 });
  await login(page);
  const entry = async (mode: string, qty: string) => {
    await page.goto("/admin/stok");
    const f = page.getByTestId("stock-form");
    await f.locator('[name="sku"]').fill(p.sku);
    await f.locator('[name="mode"]').selectOption(mode);
    await f.locator('[name="quantity"]').fill(qty);
    await page.getByTestId("stock-submit").click();
  };
  await entry("in", "5");
  await expect(page.getByTestId("flash-ok")).toContainText("yeni stok 15");
  await entry("out", "3");
  await expect(page.getByTestId("flash-ok")).toContainText("yeni stok 12");
  await entry("out", "50");
  await expect(page.getByTestId("flash-err")).toContainText("negatif");
  await entry("count", "7");
  await expect(page.getByTestId("flash-ok")).toContainText("yeni stok 7");
  expect((await inv(p.id)).quantity).toBe(7);
  const mv = await q<{ type: string; quantity: number; stockAfter: number }>(
    `SELECT type::text, quantity, "stockAfter" FROM inventory_movements WHERE "productId" = $1 ORDER BY "createdAt"`, [p.id]);
  expect(mv).toEqual([
    { type: "PURCHASE_IN", quantity: 5, stockAfter: 15 },
    { type: "ADJUSTMENT", quantity: -3, stockAfter: 12 },
    { type: "ADJUSTMENT", quantity: -5, stockAfter: 7 },
  ]);
  await entry("in", "1");
  await page.goto("/admin/stok");
  await page.getByTestId("stock-form").locator('[name="sku"]').fill("YOK-BOYLE-KOD");
  await page.getByTestId("stock-form").locator('[name="quantity"]').fill("1");
  await page.getByTestId("stock-submit").click();
  await expect(page.getByTestId("flash-err")).toContainText("bulunamadı");
});

test("ayrılmış (ödeme bekleyen) adedin altına stok düşürülemez; kritik listede görünür", async ({ page }) => {
  const p = await insertProduct({ categoryId: await subCategory(), stock: 5 });
  await q(`UPDATE inventory SET reserved = 4, "minStock" = 2 WHERE "productId" = $1`, [p.id]);
  await login(page);
  await page.goto("/admin/stok");
  const f = page.getByTestId("stock-form");
  await f.locator('[name="sku"]').fill(p.sku);
  await f.locator('[name="mode"]').selectOption("count");
  await f.locator('[name="quantity"]').fill("3");
  await page.getByTestId("stock-submit").click();
  await expect(page.getByTestId("flash-err")).toContainText("ayrılan");
  await page.goto("/admin/stok?durum=kritik");
  await expect(page.getByTestId(`stock-row-${p.sku}`).getByTestId("available")).toHaveText("1");
  // sitede satılabilir adet 1 görünür
  await page.goto(`/urun/${p.slug}`);
  await expect(page.locator("body")).toContainText("Son 1 ürün");
});
