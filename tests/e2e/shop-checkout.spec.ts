// Sepet, üyelik, adres, kargo hesabı, ödeme (TEST sağlayıcı), stok ve kargo takibi — uçtan uca.
// Not: Ödeme adımı yalnız test veritabanında etkinleşen sahte sağlayıcıyla doğrulanır; gerçek iyzico çağrısı yapılmaz.
import { test, expect, type Page } from "@playwright/test";
import { insertProduct, login, q, uniq } from "./helpers";

const sub = async () => (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
const inv = async (id: string) => (await q<{ quantity: number; reserved: number }>(`SELECT quantity, reserved FROM inventory WHERE "productId" = $1`, [id]))[0];
const money = (s: string | null) => Number((s ?? "").replace(/[^\d,]/g, "").replace(",", "."));

async function register(page: Page) {
  const email = `${uniq("musteri").toLowerCase()}@test.local`;
  await page.goto("/giris?devam=/odeme");
  const f = page.getByTestId("register-form");
  await f.locator('[name="firstName"]').fill("Ayşe");
  await f.locator('[name="lastName"]').fill("Yılmaz");
  await f.locator('[name="email"]').fill(email);
  await f.locator('[name="phone"]').fill("0532 123 45 67");
  await f.locator('[name="password"]').fill("Musteri-Sifre-2026");
  await f.locator('[name="kvkk"]').check();
  await f.getByRole("button", { name: "Üye ol" }).click();
  await expect(page.getByTestId("account-link")).toContainText("Hesabım");
  return email;
}

async function addAddress(page: Page) {
  const n = (await q<{ district: string; name: string; postalCode: string }>(
    `SELECT d.name AS district, n.name, n."postalCode" FROM neighborhoods n JOIN districts d ON d.id = n."districtId"
     WHERE d."provinceId" = 34 AND d.name = 'Kadıköy' ORDER BY n.name LIMIT 1`))[0];
  await page.goto("/hesabim?devam=/odeme");
  const f = page.getByTestId("address-form");
  await f.locator('[name="provinceId"]').selectOption("34");
  await expect(f.locator('[name="districtId"] option', { hasText: "Kadıköy" })).toHaveCount(1);
  await f.locator('[name="districtId"]').selectOption({ label: "Kadıköy" });
  await expect(f.locator("#mahalle-listesi option").first()).toBeAttached();
  await f.locator('[name="neighborhood"]').fill(n.name);
  await expect(f.locator('[name="postalCode"]')).toHaveValue(n.postalCode);
  // önce hatalı posta kodu: başka ile ait
  await f.locator('[name="postalCode"]').fill("06100");
  await f.locator('[name="line"]').fill("Moda Caddesi No: 12 Daire: 3");
  await page.getByTestId("address-submit").click();
  await expect(page.getByTestId("err-postalCode")).toBeVisible();
  await page.getByTestId("address-form").locator('[name="postalCode"]').fill(n.postalCode);
  await page.getByTestId("address-submit").click();
  await expect(page).toHaveURL(/:\d+\/odeme/);
}

test.describe("Adres sözlüğü", () => {
  test("81 il, ilçe ve mahalle listeleri veritabanından gelir", async ({ request }) => {
    const provinces = await (await request.get("/api/adres")).json();
    expect(provinces).toHaveLength(81);
    const ist = await (await request.get("/api/adres?il=34")).json();
    expect(ist.map((d: { name: string }) => d.name)).toContain("Kadıköy");
    const kad = ist.find((d: { name: string }) => d.name === "Kadıköy");
    const mahs = await (await request.get(`/api/adres?ilce=${kad.id}`)).json();
    expect(mahs.length).toBeGreaterThan(5);
    expect(mahs[0].postalCode).toMatch(/^34\d{3}$/);
  });
});

test.describe("Sepet ve kargo hesabı", () => {
  test("sepete ekle, adet değiştir, sil; toplam ve karma profil kargosu sunucuda doğru hesaplanır", async ({ page }) => {
    const cat = await sub();
    const std = await insertProduct({ categoryId: cat, price: 100, stock: 5, profile: "STD" }); // 1,5 kg, desi 2 → 120 ₺
    const heavy = await insertProduct({ categoryId: cat, price: 300, stock: 5, profile: "AGIR" });
    await q(`UPDATE products SET "weightKg" = 35 WHERE id = $1`, [heavy.id]); // 35 kg → 180 + 5×8 = 220 ₺

    await page.goto(`/urun/${std.slug}`);
    await page.getByTestId("add-to-cart").locator('[name="qty"]').fill("2");
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page).toHaveURL(/\/sepet/);
    await expect(page.getByTestId(`cart-line-${std.sku}`).getByTestId("line-total")).toContainText("200,00");
    await expect(page.getByTestId("sum-shipping")).toContainText("120,00");

    await page.goto(`/urun/${heavy.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page.getByTestId("sum-subtotal")).toContainText("500,00");
    await expect(page.getByTestId("sum-shipping")).toContainText("340,00");
    await expect(page.getByTestId("sum-total")).toContainText("840,00");

    // stoktan fazla adet: stok kadar ayarlanır
    const line = page.getByTestId(`cart-line-${std.sku}`);
    await line.locator('[name="qty"]').fill("9");
    await line.getByRole("button", { name: "Güncelle" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Stokta 5 adet var");
    await expect(page.getByTestId(`cart-line-${std.sku}`).getByTestId("line-total")).toContainText("500,00");

    await page.getByTestId(`cart-line-${heavy.sku}`).getByRole("button", { name: /sepetten çıkar/ }).click();
    await expect(page.getByTestId(`cart-line-${heavy.sku}`)).toHaveCount(0);
    // 5 adet × 2 kg/desi = 10 → standart 5–10 kademesi 160 ₺; toplam 500 + 160
    await expect(page.getByTestId("sum-shipping")).toContainText("160,00");
    await expect(page.getByTestId("sum-total")).toContainText("660,00");
  });

  test("ücretsiz kargo: ürüne özel ve sepet eşiği (eşik ağır yüke uygulanmaz)", async ({ page }) => {
    const cat = await sub();
    const free = await insertProduct({ categoryId: cat, price: 50, stock: 5 });
    await q(`UPDATE products SET "freeShipping" = true WHERE id = $1`, [free.id]);
    await page.goto(`/urun/${free.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page.getByTestId("sum-shipping")).toContainText("Ücretsiz");

    await login(page);
    await page.goto("/admin/kargo?sekme=profiller");
    await page.getByTestId("threshold-form").locator('[name="threshold"]').fill("100");
    await page.getByTestId("threshold-form").getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Ücretsiz kargo sınırı");

    const std = await insertProduct({ categoryId: cat, price: 150, stock: 5 });
    const heavy = await insertProduct({ categoryId: cat, price: 300, stock: 5, profile: "AGIR" });
    await q(`UPDATE products SET "weightKg" = 35 WHERE id = $1`, [heavy.id]);
    await page.goto(`/urun/${std.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await page.goto(`/urun/${heavy.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page.getByTestId("sum-shipping")).toContainText("220,00"); // standart ücretsiz, ağır yük ücretli

    await page.goto("/admin/kargo?sekme=profiller");
    await page.getByTestId("threshold-form").locator('[name="threshold"]').fill("2500");
    await page.getByTestId("threshold-form").getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByTestId("flash-ok")).toBeVisible();
  });
});

test.describe("Sipariş ve ödeme", () => {
  test.describe.configure({ mode: "serial" });
  let productId = "";
  let sku = "";
  let slug = "";
  let orderNo = "";
  let email = "";

  test("üye ol, adres ekle, sözleşme onayı olmadan sipariş verilemez", async ({ page }) => {
    const p = await insertProduct({ categoryId: await sub(), price: 400, stock: 3 });
    ({ id: productId, sku, slug } = p);
    await page.goto(`/urun/${slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await page.getByTestId("go-checkout").click();
    await expect(page).toHaveURL(/\/giris\?devam=%2Fodeme/);
    email = await register(page);
    await expect(page).toHaveURL(/:\d+\/odeme/);
    await addAddress(page);
    await expect(page.getByTestId("checkout-total")).toContainText("520,00"); // 400 + 120
    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("flash-err")).toContainText("onaylamanız gerekir");
    expect(await q(`SELECT 1 FROM orders WHERE "customerEmail" = $1`, [email])).toHaveLength(0);
  });

  test("başarısız ödeme: sipariş ödenmiş sayılmaz, ayrılan stok geri bırakılır, sepet korunur", async ({ page }) => {
    await loginCustomer(page, email);
    await page.goto("/odeme");
    await page.getByTestId("checkout-form").locator('[name="terms"]').check();
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/test-saglayici/);
    expect(await inv(productId)).toEqual({ quantity: 3, reserved: 1 }); // ödeme beklerken ayrıldı
    await page.getByRole("button", { name: "Ödeme başarısız" }).click();
    await expect(page.getByTestId("order-result")).toHaveAttribute("data-status", "CANCELLED");
    await expect(page.locator("h1")).toContainText("Ödeme tamamlanamadı");
    const o = (await q<{ status: string; paidAt: Date | null; ps: string }>(
      `SELECT o.status::text, o."paidAt", p.status::text AS ps FROM orders o JOIN payments p ON p."orderId" = o.id WHERE o."customerEmail" = $1`, [email]))[0];
    expect(o).toEqual({ status: "CANCELLED", paidAt: null, ps: "FAILED" });
    expect(await inv(productId)).toEqual({ quantity: 3, reserved: 0 });
    await page.goto("/sepet");
    await expect(page.getByTestId(`cart-line-${sku}`)).toBeVisible();
  });

  test("tutarı eksik bildirilen ödeme reddedilir", async ({ page }) => {
    await loginCustomer(page, email);
    await page.goto("/odeme");
    await page.getByTestId("checkout-form").locator('[name="terms"]').check();
    await page.getByTestId("place-order").click();
    await page.getByRole("button", { name: "Eksik tutar" }).click();
    await expect(page.getByTestId("order-result")).toHaveAttribute("data-status", "CANCELLED");
    const last = (await q<{ status: string; err: string }>(
      `SELECT p.status::text, p."errorMessage" AS err FROM payments p JOIN orders o ON o.id = p."orderId" WHERE o."customerEmail" = $1 ORDER BY p."createdAt" DESC LIMIT 1`, [email]))[0];
    expect(last.status).toBe("FAILED");
    expect(last.err).toContain("uyuşmuyor");
    expect(await inv(productId)).toEqual({ quantity: 3, reserved: 0 });
  });

  test("başarılı ödeme: sipariş no oluşur, stok düşer, gönderi ve e-posta kaydı oluşur, sepet boşalır", async ({ page }) => {
    await loginCustomer(page, email);
    await page.goto("/odeme");
    await page.getByTestId("checkout-form").locator('[name="terms"]').check();
    await page.getByTestId("place-order").click();
    await page.getByRole("button", { name: "Ödeme başarılı" }).click();
    await expect(page.locator("h1")).toContainText("Siparişiniz alındı");
    orderNo = (await page.getByTestId("order-number").textContent())!.trim();
    expect(orderNo).toMatch(/^OY\d{12}$/);
    const o = (await q<{ id: string; status: string; grand: string; ship: string }>(
      `SELECT id, status::text, "grandTotal"::text AS grand, "shippingTotal"::text AS ship FROM orders WHERE "orderNumber" = $1`, [orderNo]))[0];
    expect(o).toMatchObject({ status: "PAID", grand: "520.00", ship: "120.00" });
    expect(await inv(productId)).toEqual({ quantity: 2, reserved: 0 });
    expect(await q(`SELECT 1 FROM inventory_movements WHERE "orderId" = $1 AND type = 'SALE_OUT' AND quantity = -1`, [o.id])).toHaveLength(1);
    expect(await q(`SELECT 1 FROM shipments WHERE "orderId" = $1 AND status = 'PREPARING'`, [o.id])).toHaveLength(1);
    expect(await q(`SELECT 1 FROM email_logs WHERE "orderId" = $1 AND template = 'order.paid' AND status = 'LOGGED'`, [o.id])).toHaveLength(1);
    await page.goto("/sepet");
    await expect(page.getByTestId("cart-empty")).toBeVisible();
  });

  test("aynı ödeme sonucu tekrar gönderilirse stok ikinci kez düşmez", async ({ request }) => {
    const p = (await q<{ token: string }>(
      `SELECT p."providerToken" AS token FROM payments p JOIN orders o ON o.id = p."orderId" WHERE o."orderNumber" = $1`, [orderNo]))[0];
    const r = await request.post("/api/odeme/test", { form: { token: p.token, sonuc: "basarili" }, maxRedirects: 0 });
    expect(r.status()).toBe(303);
    expect(await inv(productId)).toEqual({ quantity: 2, reserved: 0 });
  });

  test("admin kargoya verir: takip no girilir, sipariş kargoda, müşteri takip eder, teslimde sipariş tamamlanır", async ({ page }) => {
    const ship = (await q<{ id: string }>(`SELECT s.id FROM shipments s JOIN orders o ON o.id = s."orderId" WHERE o."orderNumber" = $1`, [orderNo]))[0];
    const company = (await q<{ id: string }>(`SELECT id FROM cargo_companies ORDER BY "sortOrder" LIMIT 1`))[0];
    await q(`UPDATE cargo_companies SET "trackingUrlTemplate" = 'https://kargo.example/takip?no={no}' WHERE id = $1`, [company.id]);
    await login(page);
    await page.goto("/admin/kargo?sekme=gonderiler");
    const f = page.getByTestId(`shipment-form-${ship.id}`);
    // takip numarası olmadan kargoya verilemez
    await f.locator('[name="cargoCompanyId"]').selectOption(company.id);
    await f.getByRole("button", { name: "Güncelle" }).click();
    await expect(page.getByTestId("flash-err")).toContainText("Takip numarası");
    const f2 = page.getByTestId(`shipment-form-${ship.id}`);
    await f2.locator('[name="cargoCompanyId"]').selectOption(company.id);
    await f2.locator('[name="trackingNumber"]').fill("TR123456789");
    await f2.getByRole("button", { name: "Güncelle" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Kargoya verildi");
    expect((await q<{ status: string }>(`SELECT status::text FROM orders WHERE "orderNumber" = $1`, [orderNo]))[0].status).toBe("SHIPPED");
    const mail = await q<{ body: string }>(`SELECT body FROM email_logs WHERE template = 'shipment.shipped' AND "orderId" = (SELECT id FROM orders WHERE "orderNumber" = $1)`, [orderNo]);
    expect(mail[0].body).toContain("TR123456789");
    expect(mail[0].body).toContain("https://kargo.example/takip?no=TR123456789");

    // misafir takip: başka bir tarayıcıda (oturumsuz) numara + e-posta ile
    const guest = await page.context().browser()!.newContext();
    const g = await guest.newPage();
    await g.goto("/siparis-takip");
    await g.getByTestId("track-form").locator('[name="no"]').fill(orderNo);
    await g.getByTestId("track-form").locator('[name="email"]').fill("baskasi@test.local");
    await g.getByTestId("track-form").getByRole("button", { name: "Sorgula" }).click();
    await expect(g.getByTestId("flash-err")).toContainText("Sipariş bulunamadı"); // yanlış e-posta ile görünmez
    await g.getByTestId("track-form").locator('[name="no"]').fill(orderNo);
    await g.getByTestId("track-form").locator('[name="email"]').fill(email);
    await g.getByTestId("track-form").getByRole("button", { name: "Sorgula" }).click();
    await expect(g.getByTestId("track-status")).toHaveText("Kargoda");
    await expect(g.getByTestId("track-number")).toHaveText("TR123456789");
    expect(g.url()).not.toContain("@"); // e-posta adres çubuğuna yazılmaz
    // e-posta doğrulaması yapmamış başka biri yalnız numarayla göremez
    const other = await (await page.context().browser()!.newContext()).newPage();
    await other.goto(`/siparis-takip?no=${orderNo}`);
    await expect(other.getByTestId("track-result")).toHaveCount(0);
    await guest.close();

    await page.goto("/admin/kargo?sekme=gonderiler");
    const f3 = page.getByTestId(`shipment-form-${ship.id}`);
    await f3.locator('[name="status"]').selectOption("DELIVERED");
    await f3.getByRole("button", { name: "Güncelle" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Teslim edildi");
    expect((await q<{ status: string }>(`SELECT status::text FROM orders WHERE "orderNumber" = $1`, [orderNo]))[0].status).toBe("DELIVERED");
  });

  test("süresi dolan ödeme bekleyen sipariş iptal edilir ve stok ayırması bırakılır", async ({ page }) => {
    const p = await insertProduct({ categoryId: await sub(), price: 90, stock: 1 });
    await loginCustomer(page, email);
    await page.goto(`/urun/${p.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page).toHaveURL(/\/sepet/);
    await page.goto("/odeme");
    await page.getByTestId("checkout-form").locator('[name="terms"]').check();
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/test-saglayici/);
    expect(await inv(p.id)).toEqual({ quantity: 1, reserved: 1 });
    // başka müşteri bu sırada ürünü sepete ekleyemez (satılabilir adet 0)
    const other = await page.context().browser()!.newPage();
    await other.goto(`/urun/${p.slug}`);
    await expect(other.getByTestId("add-to-cart")).toHaveCount(0);
    await other.close();
    await q(`UPDATE orders SET "reservationExpiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE status = 'PENDING_PAYMENT' AND "customerEmail" = $1`, [email]);
    await page.goto("/odeme"); // sipariş oluşturma denemesi süresi dolanları temizler
    await page.getByTestId("checkout-form").locator('[name="terms"]').check();
    await page.getByTestId("place-order").click();
    await expect.poll(async () => (await inv(p.id)).reserved).toBe(1); // eski ayırma bırakıldı, yeni sipariş ayırdı
    const statuses = await q<{ status: string }>(`SELECT o.status::text FROM orders o JOIN order_items i ON i."orderId" = o.id WHERE i."productId" = $1 ORDER BY o."createdAt"`, [p.id]);
    expect(statuses.map((s) => s.status)).toEqual(["CANCELLED", "PENDING_PAYMENT"]);
  });

  test("kupon indirimi sunucuda uygulanır; admin ödenmiş siparişi iptal edince stok geri gelir", async ({ page }) => {
    const p = await insertProduct({ categoryId: await sub(), price: 200, stock: 5 });
    const code = ("KUPON" + Date.now().toString(36)).toUpperCase().slice(0, 20);
    await login(page);
    await page.goto("/admin/kampanyalar?sekme=kupon");
    const f = page.getByTestId("coupon-form");
    await f.locator('[name="code"]').fill(code);
    await f.locator('[name="value"]').fill("10");
    await page.getByTestId("coupon-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText(code);

    await q(`DELETE FROM cart_items WHERE "cartId" IN (SELECT c.id FROM carts c JOIN users u ON u.id = c."userId" WHERE u.email = $1)`, [email]);
    await loginCustomer(page, email);
    await page.goto(`/urun/${p.slug}`);
    await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
    await expect(page).toHaveURL(/\/sepet/);
    await page.goto(`/odeme?kupon=${code}`);
    await expect(page.getByTestId("checkout-total")).toContainText("300,00"); // 200 − 20 + 120 kargo
    await page.getByTestId("checkout-form").locator('[name="terms"]').check();
    await page.getByTestId("place-order").click();
    await page.getByRole("button", { name: "Ödeme başarılı" }).click();
    const no = (await page.getByTestId("order-number").textContent())!.trim();
    const o = (await q<{ id: string; discount: string; grand: string; coupon: string }>(
      `SELECT id, "discountTotal"::text AS discount, "grandTotal"::text AS grand, "couponCode" AS coupon FROM orders WHERE "orderNumber" = $1`, [no]))[0];
    expect(o).toMatchObject({ discount: "20.00", grand: "300.00", coupon: code });
    expect((await q<{ used: number }>(`SELECT "usedCount" AS used FROM coupons WHERE code = $1`, [code]))[0].used).toBe(1);
    expect(await inv(p.id)).toEqual({ quantity: 4, reserved: 0 });

    await login(page);
    await page.goto("/admin/siparisler");
    await expect(page.getByTestId(`order-row-${no}`)).toBeVisible();
    await page.goto(`/admin/siparisler/${o.id}`);
    await page.getByTestId("order-status-form").locator('[name="status"]').selectOption("CANCELLED");
    await page.getByTestId("order-status-form").getByRole("button", { name: "Durumu güncelle" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("iyzico");
    await expect(page.getByTestId("order-status")).toHaveText("İptal edildi");
    expect(await inv(p.id)).toEqual({ quantity: 5, reserved: 0 });
    expect(await q(`SELECT 1 FROM inventory_movements WHERE "orderId" = $1 AND type = 'CANCEL_IN' AND quantity = 1`, [o.id])).toHaveLength(1);
    expect(await q(`SELECT 1 FROM shipments WHERE "orderId" = $1`, [o.id])).toHaveLength(0);
  });
});

async function loginCustomer(page: Page, email: string) {
  await page.goto("/giris");
  const f = page.getByTestId("login-form");
  await f.locator('[name="email"]').fill(email);
  await f.locator('[name="password"]').fill("Musteri-Sifre-2026");
  await f.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByTestId("account-link")).toContainText("Hesabım");
}

void money;
