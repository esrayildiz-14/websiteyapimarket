// Admin paneli ve ürün yönetimi — 1. geliştirme aşaması kabul testleri.
// Gerçek sunucu + test veritabanı (oner_yapi_test). Ürün görselleri, dashboard, şifre, pasif ürün ve fiyat yansıması.
import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { insertProduct, login, q, tinyPng, uniq } from "./helpers";

const sub = async (name = "Matkaplar") => (await q<{ id: string }>(`SELECT id FROM categories WHERE name = $1`, [name]))[0].id;
const f = (page: Page, name: string) => page.locator(`[data-testid="product-form"] [name="${name}"]`);
const png = (name: string) => ({ name, mimeType: "image/png", buffer: tinyPng() });

test.describe("Admin girişi ve oturum", () => {
  test("çıkış yapınca oturum veritabanından silinir ve panel kapanır", async ({ page }) => {
    await login(page);
    const before = (await q<{ n: number }>(`SELECT count(*)::int n FROM sessions s JOIN users u ON u.id = s."userId" WHERE u.email = 'test-admin@oneryapi.local'`))[0].n;
    await page.getByRole("button", { name: "Çıkış yap" }).click();
    await expect(page).toHaveURL(/\/admin\/giris/);
    const after = (await q<{ n: number }>(`SELECT count(*)::int n FROM sessions s JOIN users u ON u.id = s."userId" WHERE u.email = 'test-admin@oneryapi.local'`))[0].n;
    expect(after).toBe(before - 1);
    await page.goto("/admin/urunler");
    await expect(page).toHaveURL(/\/admin\/giris/);
  });

  test("yönetici şifresini değiştirir; eski şifre artık geçmez", async ({ page }) => {
    const who = { email: `${uniq("yonetici").toLowerCase()}@oneryapi.local`, password: "Eski-Sifre-2026-abc" };
    const role = (await q<{ id: string }>(`SELECT id FROM roles WHERE key = 'SUPER_ADMIN'`))[0].id;
    await q(
      `INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", type, "roleId", "isActive", "marketingConsent", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'Deneme', 'Yönetici', 'STAFF', $4, true, false, now(), now())`,
      ["u" + Date.now(), who.email, await bcrypt.hash(who.password, 10), role],
    );
    await login(page, who);
    await page.goto("/admin/sifre");
    const form = page.getByTestId("password-form");
    await form.locator('[name="current"]').fill("yanlis-sifre-123");
    await form.locator('[name="next"]').fill("Yeni-Sifre-2026-xyz");
    await form.locator('[name="again"]').fill("Yeni-Sifre-2026-xyz");
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("err-current")).toBeVisible();
    await form.locator('[name="current"]').fill(who.password);
    await form.locator('[name="next"]').fill("kisa");
    await form.locator('[name="again"]').fill("kisa");
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("err-next")).toContainText("12");
    await form.locator('[name="current"]').fill(who.password);
    await form.locator('[name="next"]').fill("Yeni-Sifre-2026-xyz");
    await form.locator('[name="again"]').fill("Yeni-Sifre-2026-xyz");
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Şifreniz değiştirildi");

    await page.getByRole("button", { name: "Çıkış yap" }).click();
    await page.getByLabel("E-posta").fill(who.email);
    await page.getByLabel("Şifre").fill(who.password);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByTestId("login-error")).toContainText("hatalı");
    await login(page, { email: who.email, password: "Yeni-Sifre-2026-xyz" });
  });
});

test("dashboard ürün sayıları veritabanıyla aynı, bağlantılar doğru listeye gider", async ({ page }) => {
  await insertProduct({ categoryId: await sub(), stock: 0 }); // aktif ama stoksuz
  const db = (await q<{ total: number; active: number }>(
    `SELECT count(*)::int total, count(*) FILTER (WHERE status = 'ACTIVE')::int active FROM products WHERE "deletedAt" IS NULL`))[0];
  await login(page);
  await page.goto("/admin");
  await expect(page.getByTestId("stat-urun")).toHaveText(String(db.total));
  await expect(page.getByTestId("stat-aktif")).toHaveText(String(db.active));
  await expect(page.getByTestId("stat-pasif")).toHaveText(String(db.total - db.active));
  expect(Number(await page.getByTestId("stat-tukenen").textContent())).toBeGreaterThan(0);
  await page.getByTestId("stat-pasif").click();
  await expect(page).toHaveURL(/\/admin\/urunler\?durum=pasif/);
});

test("ürün listesi: marka filtresi ve fiyata göre sıralama", async ({ page }) => {
  const brand = (await q<{ id: string }>(
    `INSERT INTO brands (id, name, slug, "isActive", "sortOrder", "createdAt", "updatedAt") VALUES ($1, $1, $1, true, 0, now(), now()) RETURNING id`,
    [uniq("liste").toLowerCase()]))[0].id;
  const cat = await sub();
  const cheap = await insertProduct({ categoryId: cat, brandId: brand, price: 50 });
  const pricey = await insertProduct({ categoryId: cat, brandId: brand, price: 900 });
  await login(page);
  await page.goto(`/admin/urunler?marka=${brand}&sirala=fiyat-azalan`);
  const rows = page.getByTestId("product-table").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(pricey.sku);
  await expect(rows.nth(1)).toContainText(cheap.sku);
});

test.describe("Ürün görselleri", () => {
  test.describe.configure({ mode: "serial" });
  let id = "";

  test("görsel olmayan dosya sunucuda reddedilir (uzantı .png olsa bile)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/urunler/yeni");
    const sku = uniq("IMG");
    await f(page, "name").fill(`Görsel testi ${sku}`);
    await f(page, "sku").fill(sku);
    await f(page, "mainCategoryId").selectOption((await q<{ id: string }>(`SELECT id FROM categories WHERE name = 'Elektrikli El Aletleri'`))[0].id);
    await f(page, "subCategoryId").selectOption(await sub());
    await f(page, "price").fill("100");
    await f(page, "stock").fill("3");
    await f(page, "weightKg").fill("1");
    await f(page, "widthCm").fill("10");
    await f(page, "heightCm").fill("10");
    await f(page, "lengthCm").fill("10");
    await f(page, "images").setInputFiles({ name: "sahte.png", mimeType: "image/png", buffer: Buffer.from("bu bir metin dosyasıdır, görsel değil") });
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("err-images")).toBeVisible();
    expect(await q(`SELECT 1 FROM products WHERE sku = $1`, [sku])).toHaveLength(0);
    // istemci tarafı tür kontrolü: PDF seçilince kaydet düğmesi pasifleşir
    await f(page, "images").setInputFiles({ name: "belge.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await expect(page.getByTestId("image-client-error")).toContainText("JPEG, PNG veya WebP");
    await expect(page.getByTestId("product-submit")).toBeDisabled();
    // doğru görsellerle kaydedilir
    await f(page, "images").setInputFiles([png("bir.png"), png("iki.png")]);
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Ürün kaydedildi");
    id = (await q<{ id: string }>(`SELECT id FROM products WHERE sku = $1`, [sku]))[0].id;
    expect(await q(`SELECT 1 FROM product_images WHERE "productId" = $1`, [id])).toHaveLength(2);
  });

  test("düzenlemede görsel eklenir, kapak değiştirilir, silinen görsel diskten de kalkar", async ({ page, request }) => {
    await login(page);
    await page.goto(`/admin/urunler/${id}`);
    await f(page, "images").setInputFiles(png("uc.png"));
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Değişiklikler kaydedildi");
    const imgs = await q<{ id: string; url: string; sortOrder: number }>(`SELECT id, url, "sortOrder" FROM product_images WHERE "productId" = $1 ORDER BY "sortOrder"`, [id]);
    expect(imgs.map((i) => i.sortOrder)).toEqual([0, 1, 2]);

    await page.locator(".img-tile").nth(2).getByRole("button", { name: "Kapak yap" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Kapak");
    const cover = (await q<{ id: string }>(`SELECT id FROM product_images WHERE "productId" = $1 AND "sortOrder" = 0`, [id]))[0].id;
    expect(cover).toBe(imgs[2].id);

    const victim = imgs[0];
    expect((await request.get(victim.url)).status()).toBe(200);
    const tile = page.locator(".img-tile").filter({ has: page.locator(`img[src="${victim.url}"]`) });
    await tile.getByRole("button", { name: "Sil" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Görsel silindi");
    expect(await q(`SELECT 1 FROM product_images WHERE id = $1`, [victim.id])).toHaveLength(0);
    expect((await request.get(victim.url)).status()).toBe(404);
    const left = await q<{ sortOrder: number }>(`SELECT "sortOrder" FROM product_images WHERE "productId" = $1 ORDER BY "sortOrder"`, [id]);
    expect(left.map((l) => l.sortOrder)).toEqual([0, 1]);
  });

  test("mağazada kapak görseli gösterilir", async ({ page }) => {
    const p = (await q<{ slug: string; url: string }>(
      `SELECT p.slug, i.url FROM products p JOIN product_images i ON i."productId" = p.id AND i."sortOrder" = 0 WHERE p.id = $1`, [id]))[0];
    await page.goto(`/urun/${p.slug}`);
    await expect(page.locator(`img[src="${p.url}"]`).first()).toBeVisible();
  });
});

test.describe("Müşteri tarafına yansıma", () => {
  test("fiyat değişince sepetteki ürünün fiyatı da güncellenir", async ({ page, browser }) => {
    const p = await insertProduct({ categoryId: await sub(), price: 100, stock: 5 });
    await page.goto(`/urun/${p.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page.getByTestId(`cart-line-${p.sku}`).getByTestId("line-total")).toContainText("100,00");

    const admin = await browser.newPage();
    await login(admin);
    await admin.goto(`/admin/fiyatlar?q=${p.sku}`);
    await admin.getByTestId(`price-row-${p.sku}`).getByLabel("Satış fiyatı").fill("150,00");
    await admin.getByTestId(`price-row-${p.sku}`).getByRole("button", { name: "Kaydet" }).click();
    await expect(admin.getByTestId("flash-ok")).toBeVisible();
    await admin.close();

    await page.goto("/sepet");
    await expect(page.getByTestId(`cart-line-${p.sku}`).getByTestId("line-total")).toContainText("150,00");
    await page.goto(`/urun/${p.slug}`);
    await expect(page.getByTestId("product-price")).toContainText("150,00");
  });

  test("pasife alınan ürün satın alınamaz: sayfası kapanır, sepette işaretlenir, ödemeye geçilemez", async ({ page, browser }) => {
    const p = await insertProduct({ categoryId: await sub(), price: 80, stock: 5 });
    await page.goto(`/urun/${p.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page.getByTestId(`cart-line-${p.sku}`)).toBeVisible();

    const admin = await browser.newPage();
    await login(admin);
    await admin.goto(`/admin/urunler/${p.id}`);
    await admin.getByRole("button", { name: "Yayından kaldır" }).click();
    await expect(admin.getByTestId("product-status")).toHaveText("Pasif");
    await admin.close();

    expect((await page.goto(`/urun/${p.slug}`))?.status()).toBe(404);
    await page.goto("/sepet");
    await expect(page.getByTestId(`cart-line-${p.sku}`).getByTestId("line-problem")).toContainText("satışta değil");
    await expect(page.getByTestId("go-checkout")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("sum-total")).toContainText("0,00");
    // doğrudan sepete ekleme isteği de reddedilir (form elle gönderilse bile)
    const cat = await sub();
    const other = await insertProduct({ categoryId: cat, price: 10, stock: 5 });
    await page.goto(`/urun/${other.slug}`);
    await page.getByTestId("add-to-cart").locator('[name="productId"]').evaluate((el, v) => ((el as HTMLInputElement).value = v), p.id);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page.getByTestId("flash-err")).toContainText("satışta değil");
  });
});
