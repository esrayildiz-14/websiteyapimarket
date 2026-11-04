// QA: ürün listesi — sayfalama, filtreler (marka, fiyat, stok) birlikte, geçerli fiyata göre sıralama, boş sonuç mesajı.
import { test, expect } from "@playwright/test";
import { insertProduct, q, uniq } from "./helpers";

test("kategori listesi: 30 ürün sayfalanır, toplam doğru; filtreler birlikte çalışır; indirimli fiyata göre sıralama", async ({ page }) => {
  test.setTimeout(240_000);
  // yalnız bu teste ait boş bir alt kategori
  const parent = (await q<{ id: string; shippingProfileId: string | null }>(`SELECT id, "defaultShippingProfileId" AS "shippingProfileId" FROM categories WHERE "parentId" IS NULL ORDER BY "sortOrder" LIMIT 1`))[0];
  const slug = uniq("qa-kat").toLowerCase();
  const catId = "c" + slug.replace(/-/g, "");
  await q(`INSERT INTO categories (id, name, slug, "parentId", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES ($1, 'QA Kategori', $2, $3, 999, true, now(), now())`, [catId, slug, parent.id]);
  const brandA = uniq("qa-a").toLowerCase(), brandB = uniq("qa-b").toLowerCase();
  for (const b of [brandA, brandB]) await q(`INSERT INTO brands (id, name, slug, "isActive", "sortOrder", "createdAt", "updatedAt") VALUES ($1, $1, $1, true, 0, now(), now())`, [b]);
  const ids: { id: string; price: number; brand: string; stock: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const price = 100 + i * 10;
    const brand = i % 2 ? brandA : brandB;
    const stock = i % 3 === 0 ? 0 : 5;
    const p = await insertProduct({ categoryId: catId, price, stock, brandId: brand, name: `QA ürün ${String(i).padStart(2, "0")}` });
    ids.push({ id: p.id, price, brand, stock });
  }
  // en pahalı ürünün indirimli fiyatı en ucuz olsun → fiyata göre sıralamada ilk sırada çıkmalı
  await q(`UPDATE products SET "salePrice" = 50 WHERE id = $1`, [ids[29].id]);

  await page.goto(`/kategori/${slug}`);
  await expect(page.getByTestId("result-count")).toHaveText("30 ürün · 1–24 arası gösteriliyor");
  await expect(page.getByTestId("product-grid").locator("[data-sku]")).toHaveCount(24);
  await page.getByTestId("pagination").getByRole("link", { name: "2" }).click();
  await expect(page.getByTestId("product-grid").locator("[data-sku]")).toHaveCount(6);
  await expect(page.getByTestId("result-count")).toContainText("25–30");

  await page.goto(`/kategori/${slug}?sirala=fiyat-artan`);
  const firstPrice = await page.getByTestId("product-grid").locator("[data-sku]").first().textContent();
  expect(firstPrice).toContain("50,00");

  // marka A + 150–250 ₺ + stokta
  const expected = ids.filter((x) => x.brand === brandA && x.price >= 150 && x.price <= 250 && x.stock > 0 && x !== ids[29]).length;
  await page.goto(`/kategori/${slug}`);
  const f = page.getByTestId("filter-form");
  await f.locator(`input[name="marka"][value="${brandA}"]`).check();
  await f.locator('[name="min"]').fill("150");
  await f.locator('[name="max"]').fill("250");
  await f.locator('[name="stokta"]').check();
  await page.getByTestId("filter-submit").click();
  await expect(page.getByTestId("result-count")).toHaveText(`${expected} ürün`);

  await page.goto(`/kategori/${slug}?min=999999`);
  await expect(page.getByTestId("empty-result")).toBeVisible();
  // hatalı parametreler sayfayı bozmaz
  for (const bad of ["sayfa=-5", "sayfa=abc", "min=-1&max=xyz", "marka=%27%3B%20DROP%20TABLE", "sirala=<script>"]) {
    expect((await page.goto(`/kategori/${slug}?${bad}`))?.status(), bad).toBe(200);
  }
});

test("arama: sonuç, boş sonuç mesajı, tek karakterde uyarı", async ({ page }) => {
  const cat = (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0];
  const p = await insertProduct({ categoryId: cat.id, stock: 2, name: `Şişe Ğıda Çözücü ${Date.now()}` });
  await page.goto(`/arama?q=${encodeURIComponent("şişe ğıda")}`);
  await expect(page.getByTestId("product-grid").locator(`[data-sku="${p.sku}"]`)).toBeVisible();
  await page.goto(`/arama?q=${p.sku}`);
  await expect(page.getByTestId("product-grid").locator(`[data-sku="${p.sku}"]`)).toBeVisible();
  await page.goto("/arama?q=zzzyyyxxx-bulunmaz");
  await expect(page.getByTestId("empty-result")).toBeVisible();
  await page.goto("/arama?q=a");
  await expect(page.getByTestId("result-count")).toHaveText("En az 2 karakter girin.");
});
