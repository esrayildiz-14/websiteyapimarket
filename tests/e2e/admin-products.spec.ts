// Uçtan uca test: admin girişi + ürün ekleme / düzenleme / silme + müşteri tarafında görünürlük.
// Gerçek sunucu (next dev) ve gerçek test veritabanı (oner_yapi_test) üzerinde çalışır.
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, STAFF, login, q, tinyPng, uniq } from "./helpers";

type Cat = { id: string; slug: string };
async function category(name: string): Promise<Cat> {
  const rows = await q<Cat>(`SELECT id, slug FROM categories WHERE name = $1`, [name]);
  expect(rows.length, `Kategori bulunamadı: ${name}`).toBe(1);
  return rows[0];
}
async function profileId(code: string) {
  return (await q<{ id: string }>(`SELECT id FROM shipping_profiles WHERE code = $1`, [code]))[0].id;
}
const f = (page: Page, name: string) => page.locator(`[data-testid="product-form"] [name="${name}"]`);

async function fillProduct(page: Page, p: { name: string; sku: string; barcode?: string; status?: "ACTIVE" | "PASSIVE" }) {
  const main = await category("Elektrikli El Aletleri");
  const sub = await category("Matkaplar");
  await f(page, "name").fill(p.name);
  await f(page, "sku").fill(p.sku);
  if (p.barcode) await f(page, "barcode").fill(p.barcode);
  await f(page, "brandId").selectOption({ label: "Bosch" });
  await f(page, "mainCategoryId").selectOption(main.id);
  await f(page, "subCategoryId").selectOption(sub.id);
  await f(page, "shortDescription").fill("Darbeli matkap, 13 mm mandren");
  await f(page, "description").fill("Beton, ahşap ve metal delme işleri için darbeli matkap.");
  await page.getByLabel("Özellik 1 adı").fill("Güç");
  await page.getByLabel("Özellik 1 değeri").fill("700 W");
  await page.getByRole("button", { name: /özellik ekle/i }).click();
  await page.getByLabel("Özellik 2 adı").fill("Mandren");
  await page.getByLabel("Özellik 2 değeri").fill("13 mm");
  await f(page, "price").fill("2.650,00");
  await f(page, "salePrice").fill("2.499,90");
  await f(page, "purchasePrice").fill("1.900");
  await f(page, "vatRate").selectOption("20");
  await f(page, "saleUnit").selectOption("ADET");
  await f(page, "stock").fill("15");
  await f(page, "minStock").fill("3");
  await f(page, "weightKg").fill("2,4");
  await f(page, "widthCm").fill("30");
  await f(page, "heightCm").fill("12");
  await f(page, "lengthCm").fill("35");
  await f(page, "shippingProfileId").selectOption(await profileId("STD"));
  await f(page, "images").setInputFiles({ name: "matkap.png", mimeType: "image/png", buffer: tinyPng() });
  await page.locator(`[data-testid="product-form"] [name="status"][value="${p.status ?? "ACTIVE"}"]`).check();
}

async function productBySku(sku: string) {
  const rows = await q<{ id: string; slug: string; status: string; price: string; salePrice: string | null; stock: number; deletedAt: Date | null; specs: { label: string; value: string }[] }>(
    `SELECT p.id, p.slug, p.status, p.price::text, p."salePrice"::text, i.quantity AS stock, p."deletedAt", p.specs
     FROM products p LEFT JOIN inventory i ON i."productId" = p.id WHERE p.sku = $1`,
    [sku],
  );
  return rows[0];
}

test.describe("Admin girişi", () => {
  test("oturumsuz kullanıcı giriş sayfasına yönlendirilir", async ({ page }) => {
    await page.goto("/admin/urunler");
    await expect(page).toHaveURL(/\/admin\/giris/);
  });

  test("hatalı şifre reddedilir", async ({ page }) => {
    await page.goto("/admin/giris");
    await page.getByLabel("E-posta").fill(ADMIN.email);
    await page.getByLabel("Şifre").fill("yanlis-sifre");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByTestId("login-error")).toContainText("hatalı");
    await expect(page).toHaveURL(/\/admin\/giris/);
  });

  test("5 hatalı denemeden sonra hesap geçici olarak kilitlenir", async ({ page }) => {
    const email = "kilit-testi@oneryapi.local";
    await page.goto("/admin/giris");
    // Her denemede sunucu yanıtını ve formun sıfırlanmasını (şifre alanı boşalır) bekle.
    const attempt = async (password: string) => {
      await page.getByLabel("E-posta").fill(email);
      await page.getByLabel("Şifre").fill(password);
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/giris")),
        page.getByRole("button", { name: "Giriş yap" }).click(),
      ]);
      await expect(page.getByLabel("Şifre")).toHaveValue("");
      await expect(page.getByRole("button", { name: "Giriş yap" })).toBeEnabled();
    };
    for (let i = 0; i < 5; i++) {
      await attempt("yanlis-" + i);
      await expect(page.getByTestId("login-error")).toContainText("hatalı");
    }
    await attempt("herhangi");
    await expect(page.getByTestId("login-error")).toContainText("Çok fazla hatalı deneme");
    const fails = await q(`SELECT 1 FROM login_attempts WHERE email = $1 AND success = false`, [email]);
    expect(fails).toHaveLength(5);
  });

  test("doğru bilgilerle giriş yapılır, oturum çerezi httpOnly'dir", async ({ page, context }) => {
    await login(page);
    const cookie = (await context.cookies()).find((c) => c.name === "oy_admin");
    expect(cookie?.httpOnly).toBe(true);
    const sessions = await q(`SELECT 1 FROM sessions s JOIN users u ON u.id = s."userId" WHERE u.email = $1`, [ADMIN.email]);
    expect(sessions.length).toBeGreaterThan(0);
  });
});

test.describe("Ürün yönetimi", () => {
  // Adımlar aynı ürün üzerinde sırayla ilerler; biri başarısız olursa kalanı atlanır.
  test.describe.configure({ mode: "serial" });
  const SKU = uniq("TST-MTK");
  const NAME = `Test Darbeli Matkap ${SKU}`;

  test("eksik alanlarla kayıt yapılmaz, alan hataları gösterilir", async ({ page }) => {
    const before = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM products`))[0].n;
    await login(page);
    await page.goto("/admin/urunler/yeni");
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("form-message")).toBeVisible();
    await expect(page.getByTestId("err-name")).toBeVisible();
    await expect(page.getByTestId("err-sku")).toBeVisible();
    await expect(page.getByTestId("err-price")).toBeVisible();
    expect((await q<{ n: number }>(`SELECT count(*)::int AS n FROM products`))[0].n).toBe(before);
  });

  test("tüm alanlarla ürün eklenir ve veritabanına yazılır", async ({ page }) => {
    await login(page);
    await page.goto("/admin/urunler/yeni");
    await fillProduct(page, { name: NAME, sku: SKU, barcode: "8690000000012" });
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Ürün kaydedildi");
    await expect(page).toHaveURL(/\/admin\/urunler\/[a-z0-9]+/);

    const p = await productBySku(SKU);
    expect(p.status).toBe("ACTIVE");
    expect(p.price).toBe("2650.00");
    expect(p.salePrice).toBe("2499.90");
    expect(p.stock).toBe(15);
    expect(p.specs).toEqual([{ label: "Güç", value: "700 W" }, { label: "Mandren", value: "13 mm" }]);

    const imgs = await q<{ url: string }>(`SELECT url FROM product_images WHERE "productId" = $1`, [p.id]);
    expect(imgs).toHaveLength(1);
    const img = await page.request.get(imgs[0].url);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toContain("image/png");

    const mv = await q<{ type: string; quantity: number; stockAfter: number }>(
      `SELECT type::text, quantity, "stockAfter" FROM inventory_movements WHERE "productId" = $1`, [p.id]);
    expect(mv).toEqual([{ type: "PURCHASE_IN", quantity: 15, stockAfter: 15 }]);
    expect(await q(`SELECT 1 FROM price_history WHERE "productId" = $1`, [p.id])).toHaveLength(1);
    expect(await q(`SELECT 1 FROM audit_logs WHERE "entityId" = $1`, [p.id])).not.toHaveLength(0);
  });

  test("barkod: hatalı kontrol hanesinde doğru numara önerilir; barkodsuz ürün için mağaza içi barkod oluşturulur", async ({ page }) => {
    await login(page);
    await page.goto("/admin/urunler/yeni");
    const sku2 = uniq("TST-BRK");
    await fillProduct(page, { name: `Barkod testi ${sku2}`, sku: sku2, barcode: "869 0000 000019" });
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("err-barcode")).toContainText("8690000000012");
    await page.getByTestId("make-barcode").click();
    await expect(f(page, "barcode")).toHaveValue(/^29\d{11}$/);
    const code = await f(page, "barcode").inputValue();
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Ürün kaydedildi");
    expect((await q<{ barcode: string }>(`SELECT barcode FROM products WHERE sku = $1`, [sku2]))[0].barcode).toBe(code);
  });

  test("aynı ürün kodu ikinci kez kullanılamaz", async ({ page }) => {
    await login(page);
    await page.goto("/admin/urunler/yeni");
    await fillProduct(page, { name: "Kopya kod denemesi", sku: SKU });
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("err-sku")).toBeVisible();
    expect(await q(`SELECT 1 FROM products WHERE sku = $1`, [SKU])).toHaveLength(1);
  });

  test("aktif ürün müşteri tarafında ana kategori, alt kategori ve ürün sayfasında görünür", async ({ page }) => {
    const p = await productBySku(SKU);
    for (const cat of ["Elektrikli El Aletleri", "Matkaplar"]) {
      const c = await category(cat);
      await page.goto(`/kategori/${c.slug}`);
      await expect(page.getByTestId("product-grid").locator(`[data-sku="${SKU}"]`)).toBeVisible();
    }
    await page.goto(`/urun/${p.slug}`);
    await expect(page.getByTestId("product-name")).toHaveText(NAME);
    await expect(page.getByTestId("product-price")).toContainText("2.499,90");
    await expect(page.getByTestId("spec-table")).toContainText("700 W");
  });

  test("ürün admin listesinde arama ile bulunur", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/urunler?q=${encodeURIComponent(SKU)}`);
    await expect(page.getByTestId("product-table")).toContainText(SKU);
  });

  test("düzenleme: fiyat, stok ve durum güncellenir; pasif ürün sitede görünmez", async ({ page }) => {
    const before = await productBySku(SKU);
    await login(page);
    await page.goto(`/admin/urunler/${before.id}`);
    await f(page, "price").fill("2.800,00");
    await f(page, "salePrice").fill("");
    await f(page, "stock").fill("10");
    await page.locator(`[data-testid="product-form"] [name="status"][value="PASSIVE"]`).check();
    await page.getByTestId("product-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Değişiklikler kaydedildi");
    await expect(page.getByTestId("product-status")).toHaveText("Pasif");

    const p = await productBySku(SKU);
    expect(p.price).toBe("2800.00");
    expect(p.salePrice).toBeNull();
    expect(p.stock).toBe(10);
    expect(p.status).toBe("PASSIVE");
    const adj = await q<{ quantity: number; stockAfter: number }>(
      `SELECT quantity, "stockAfter" FROM inventory_movements WHERE "productId" = $1 AND type = 'ADJUSTMENT'`, [p.id]);
    expect(adj).toEqual([{ quantity: -5, stockAfter: 10 }]);
    expect(await q(`SELECT 1 FROM price_history WHERE "productId" = $1`, [p.id])).toHaveLength(2);

    const res = await page.goto(`/urun/${p.slug}`);
    expect(res?.status()).toBe(404);
    const sub = await category("Matkaplar");
    await page.goto(`/kategori/${sub.slug}`);
    await expect(page.locator(`[data-sku="${SKU}"]`)).toHaveCount(0);
  });

  test("yayına alınca tekrar görünür", async ({ page }) => {
    const p = await productBySku(SKU);
    await login(page);
    await page.goto(`/admin/urunler/${p.id}`);
    await page.getByRole("button", { name: "Yayına al" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("yayına alındı");
    const res = await page.goto(`/urun/${p.slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("product-price")).toContainText("2.800,00");
  });

  test("silme: ürün siteden kalkar, veritabanında işaretlenir; geri alınabilir", async ({ page }) => {
    const p = await productBySku(SKU);
    await login(page);
    await page.goto(`/admin/urunler/${p.id}`);
    await page.getByRole("button", { name: "Ürünü sil" }).click();
    await expect(page).toHaveURL(/\/admin\/urunler(\?|$)/);
    await expect(page.getByTestId("flash-ok")).toContainText("Ürün silindi");

    const deleted = await productBySku(SKU);
    expect(deleted.deletedAt).not.toBeNull();
    expect((await page.goto(`/urun/${p.slug}`))?.status()).toBe(404);

    await page.goto(`/admin/urunler`);
    await expect(page.getByTestId("product-table")).not.toContainText(SKU);

    await page.goto(`/admin/urunler/${p.id}`);
    await page.getByRole("button", { name: "Geri al" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("geri alındı");
    const restored = await productBySku(SKU);
    expect(restored.deletedAt).toBeNull();
    expect(restored.status).toBe("PASSIVE");
  });
});

test.describe("Yetki ve güvenlik", () => {
  test("sipariş personeli ürün ekleme sayfasına erişemez", async ({ page }) => {
    await login(page, STAFF);
    await page.goto("/admin/urunler/yeni");
    await expect(page).toHaveURL(/\/admin\?hata=/);
    await expect(page.getByTestId("flash-err")).toContainText("yetkiniz yok");
    await expect(page.getByTestId("product-form")).toHaveCount(0);
  });

  test("yükleme klasörü dışına dosya yolu ile erişilemez", async ({ request }) => {
    for (const path of ["/uploads/..%2F..%2Fpackage.json", "/uploads/products/../../.env", "/uploads/%2e%2e/%2e%2e/package.json"]) {
      const res = await request.get(path);
      // Next.js hatalı yolları 400 ile, uygulama ise klasör dışını 404 ile reddeder; ikisi de güvenli.
      expect([400, 404], path).toContain(res.status());
      expect(await res.text(), path).not.toContain("oner-yapi-market");
    }
  });

  test("admin sayfaları önbelleğe alınmaz ve arama motorlarına kapalıdır", async ({ request }) => {
    const res = await request.get("/admin/giris");
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });
});
