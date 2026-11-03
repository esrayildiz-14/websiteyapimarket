// Mobil / tablet / masaüstü görünüm testleri: yatay taşma yok, temel akış her ekranda çalışır.
import { test, expect, type Page } from "@playwright/test";
import { insertProduct, q } from "./helpers";

async function noHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `sayfa genişliği ${sw}px > ekran ${iw}px`).toBeLessThanOrEqual(iw + 1);
}

test("ana sayfa, kategori, ürün, sepet ve giriş sayfaları ekrana sığar; sepete ekleme çalışır", async ({ page }) => {
  const cat = (await q<{ id: string; slug: string }>(`SELECT id, slug FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0];
  const p = await insertProduct({ categoryId: cat.id, price: 75, stock: 4, name: "Uzun adlı test ürünü — çok uzun açıklamalı bir ürün başlığı mobilde taşmamalı" });
  for (const url of ["/", `/kategori/${cat.slug}`, `/urun/${p.slug}`, "/urunler", "/giris", "/siparis-takip", "/sss", "/sayfa/teslimat-ve-kargo"]) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(200);
    await noHorizontalOverflow(page);
  }
  await page.goto(`/urun/${p.slug}`);
  await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
  await expect(page).toHaveURL(/\/sepet/);
  await expect(page.getByTestId(`cart-line-${p.sku}`)).toBeVisible();
  await noHorizontalOverflow(page);
  await expect(page.getByTestId("go-checkout")).toBeVisible();
});
