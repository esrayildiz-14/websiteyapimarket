// QA: uçtan uca iş akışı — müşteri arar → kategori → sepete ekler → adres + TEST ödeme → sipariş;
// admin siparişi görür ve günceller → müşteri hesabından güncel durumu görür. Fiyatlar sunucuda kontrol edilir.
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { insertProduct, login, q, uniq } from "./helpers";

test("müşteri → sipariş → admin güncelleme → müşteri durumu görür", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const cat = (await q<{ id: string; slug: string; name: string }>(`SELECT id, slug, name FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0];
  const name = `Uçtan uca matkap ${Date.now()}`;
  const p = await insertProduct({ categoryId: cat.id, price: 250, stock: 4, name });
  const email = `${uniq("akis").toLowerCase()}@test.local`;
  const uid = uniq("u").toLowerCase();
  await q(`INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", type, "isActive", "marketingConsent", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'Emre', 'Kaya', 'CUSTOMER', true, false, now(), now())`, [uid, email, await bcrypt.hash("Musteri-Sifre-2026", 10)]);
  const n = (await q<{ districtId: number; name: string; postalCode: string }>(
    `SELECT d.id AS "districtId", n.name, n."postalCode" FROM neighborhoods n JOIN districts d ON d.id = n."districtId" WHERE d."provinceId" = 6 ORDER BY n.name LIMIT 1`))[0];
  await q(`INSERT INTO addresses (id, "userId", title, "fullName", phone, "provinceId", "districtId", neighborhood, "postalCode", line, "isDefault", "createdAt", "updatedAt")
           VALUES ($1, $2, 'Ev', 'Emre Kaya', '5321234567', 6, $3, $4, $5, 'Atatürk Bulvarı No 5', true, now(), now())`, [uniq("a").toLowerCase(), uid, n.districtId, n.name, n.postalCode]);

  // müşteri
  await page.goto("/giris");
  const lf = page.getByTestId("login-form");
  await lf.locator('[name="email"]').fill(email);
  await lf.locator('[name="password"]').fill("Musteri-Sifre-2026");
  await lf.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByTestId("account-link")).toContainText("Emre");
  await page.getByRole("search").getByLabel("Ara").fill(name);
  await page.getByRole("search").getByRole("button", { name: "Ara" }).click();
  await page.getByTestId("product-grid").locator(`[data-sku="${p.sku}"]`).getByRole("link").first().click();
  await expect(page.locator("h1")).toHaveText(name);
  await page.locator(".oy-crumbs").getByRole("link", { name: cat.name }).click();
  await expect(page.locator("h1")).toHaveText(cat.name);
  await page.goto(`/urun/${p.slug}`);
  await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
  await expect(page).toHaveURL(/\/sepet/);
  await expect(page.getByTestId(`cart-line-${p.sku}`)).toBeVisible();
  // fiyat sunucuda: ürün fiyatı değişirse sepet yeni fiyatı gösterir (istemcide saklanan fiyata güvenilmez)
  await q(`UPDATE products SET price = 260 WHERE id = $1`, [p.id]);
  await page.reload();
  await expect(page.getByTestId(`cart-line-${p.sku}`).getByTestId("line-total")).toContainText("260,00");
  await page.goto("/odeme");
  await page.getByTestId("checkout-form").locator('[name="terms"]').check();
  await page.getByTestId("place-order").click();
  await page.getByRole("button", { name: "Ödeme başarılı" }).click();
  await expect(page.locator("h1")).toContainText("Siparişiniz alındı");
  const orderNo = (await page.getByTestId("order-number").textContent())!.trim();
  const o = (await q<{ status: string; total: string; price: string }>(
    `SELECT o.status::text, o."grandTotal"::text AS total, i."unitPrice"::text AS price FROM orders o JOIN order_items i ON i."orderId" = o.id WHERE o."orderNumber" = $1`, [orderNo]))[0];
  expect(o.status).toBe("PAID");
  expect(o.price).toBe("260.00"); // sipariş anındaki fiyat korunur
  expect((await q<{ quantity: number }>(`SELECT quantity FROM inventory WHERE "productId" = $1`, [p.id]))[0].quantity).toBe(3);

  // ürün fiyatı sonradan değişse de siparişteki fiyat değişmez
  await q(`UPDATE products SET price = 999 WHERE id = $1`, [p.id]);
  expect((await q<{ price: string }>(`SELECT i."unitPrice"::text price FROM order_items i JOIN orders o ON o.id = i."orderId" WHERE o."orderNumber" = $1`, [orderNo]))[0].price).toBe("260.00");

  // admin
  const admin = await (await browser.newContext()).newPage();
  await login(admin);
  await admin.goto("/admin/siparisler");
  await admin.getByTestId(`order-row-${orderNo}`).getByRole("link").first().click();
  await expect(admin.getByTestId("order-status")).toContainText("Ödendi");
  await admin.getByTestId("order-status-form").locator('[name="status"]').selectOption("PREPARING");
  await admin.getByTestId("order-status-form").getByRole("button", { name: "Durumu güncelle" }).click();
  await expect(admin.getByTestId("order-status")).toContainText("Hazırlanıyor");

  // müşteri hesabından
  await page.goto("/hesabim");
  await page.getByTestId(`my-order-${orderNo}`).click();
  await expect(page.getByTestId("track-status")).toHaveText("Hazırlanıyor");
  expect(page.url()).not.toContain("@");
});
