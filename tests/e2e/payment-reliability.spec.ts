// Faz 4 / P0: ödeme ve stok güvenilirliği senaryoları (TEST sağlayıcı; gerçek para hareketi yok).
//  - ödeme alındı ama bildirim gelmedi → mutabakatla ödendi olur
//  - müşteri ödeme sayfasını kapattı → süre dolunca iptal, stok serbest
//  - süre dolup iptal edildikten SONRA gelen başarılı bildirim → sipariş ödendi sayılmaz, iade için işaretlenir
//  - müşteri ödeme sayfasına geri dönüp yeniden sipariş verir → tek aktif sipariş, tek stok ayırması
//  - aynı siparişin iki kez gönderilmesi (çift tıklama) → tek sipariş
//  - son ürünü iki müşteri aynı anda almaya çalışır → yalnız biri ayırır
import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { insertProduct, q, uniq } from "./helpers";

const PASS = "Musteri-Sifre-2026";
const sub = async () => (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
const inv = async (id: string) => (await q<{ quantity: number; reserved: number }>(`SELECT quantity, reserved FROM inventory WHERE "productId" = $1`, [id]))[0];
const orders = async (email: string) =>
  q<{ orderNumber: string; status: string; adminNote: string | null }>(
    `SELECT "orderNumber", status::text, "adminNote" FROM orders WHERE "customerEmail" = $1 ORDER BY "createdAt"`, [email]);

async function customer() {
  const email = `${uniq("odeme").toLowerCase()}@test.local`;
  const id = uniq("c").toLowerCase();
  await q(
    `INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", type, "isActive", "marketingConsent", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Deniz', 'Ak', 'CUSTOMER', true, false, now(), now())`, [id, email, await bcrypt.hash(PASS, 10)]);
  const n = (await q<{ districtId: number; name: string; postalCode: string }>(
    `SELECT d.id AS "districtId", n.name, n."postalCode" FROM neighborhoods n JOIN districts d ON d.id = n."districtId"
     WHERE d."provinceId" = 34 AND d.name = 'Kadıköy' ORDER BY n.name LIMIT 1`))[0];
  await q(
    `INSERT INTO addresses (id, "userId", title, "fullName", phone, "provinceId", "districtId", neighborhood, "postalCode", line, "isDefault", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Ev', 'Deniz Ak', '5321234567', 34, $3, $4, $5, 'Moda Cad. No 1', true, now(), now())`,
    [uniq("a").toLowerCase(), id, n.districtId, n.name, n.postalCode]);
  return email;
}

async function loginCustomer(page: Page, email: string) {
  await page.goto("/giris");
  const f = page.getByTestId("login-form");
  await f.locator('[name="email"]').fill(email);
  await f.locator('[name="password"]').fill(PASS);
  await f.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByTestId("account-link")).toContainText("Hesabım");
}

async function addToCart(page: Page, slug: string) {
  await page.goto(`/urun/${slug}`);
  await page.getByTestId("add-to-cart").getByRole("button", { name: "Sepete ekle" }).click();
  await expect(page).toHaveURL(/\/sepet/);
}

async function placeOrder(page: Page) {
  await page.goto("/odeme");
  await page.getByTestId("checkout-form").locator('[name="terms"]').check();
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/test-saglayici/);
}

const expire = (email: string) =>
  q(`UPDATE orders SET "reservationExpiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE status = 'PENDING_PAYMENT' AND "customerEmail" = $1`, [email]);

test("ödeme alındı ama siteye bildirim gelmedi: süre dolunca sağlayıcıya sorulur, sipariş ödendi olur", async ({ page }) => {
  const email = await customer();
  const p = await insertProduct({ categoryId: await sub(), price: 150, stock: 4 });
  await loginCustomer(page, email);
  await addToCart(page, p.slug);
  await placeOrder(page);
  await page.getByRole("button", { name: "Ödendi, bildirim gelmedi" }).click();
  await expect(page.locator("h1")).not.toContainText("Siparişiniz alındı");
  expect((await orders(email))[0].status).toBe("PENDING_PAYMENT");
  expect(await inv(p.id)).toEqual({ quantity: 4, reserved: 1 });
  await expire(email);
  await page.goto("/sepet"); // mutabakat sepet / ödeme / admin sipariş listesinde çalışır
  await expect.poll(async () => (await orders(email))[0].status).toBe("PAID");
  expect(await inv(p.id)).toEqual({ quantity: 3, reserved: 0 });
  const pay = (await q<{ status: string }>(`SELECT p.status::text FROM payments p JOIN orders o ON o.id = p."orderId" WHERE o."customerEmail" = $1`, [email]))[0];
  expect(pay.status).toBe("SUCCESS");
});

test("müşteri ödeme sayfasını kapattı: süre dolunca iptal, ayrılan stok serbest; sonradan gelen başarılı bildirim siparişi ödendi yapmaz", async ({ page, request }) => {
  const email = await customer();
  const p = await insertProduct({ categoryId: await sub(), price: 80, stock: 2 });
  await loginCustomer(page, email);
  await addToCart(page, p.slug);
  await placeOrder(page);
  const token = new URL(page.url()).searchParams.get("token")!;
  await page.goto("/"); // ödeme sayfasından ayrıldı
  await expire(email);
  await page.goto("/sepet");
  await expect.poll(async () => (await orders(email))[0].status).toBe("CANCELLED");
  expect(await inv(p.id)).toEqual({ quantity: 2, reserved: 0 });

  const r = await request.post("/api/odeme/test", { form: { token, sonuc: "basarili" }, maxRedirects: 0 });
  expect(r.status()).toBe(303);
  const o = (await orders(email))[0];
  expect(o.status).toBe("CANCELLED");
  expect(o.adminNote).toContain("İade veya manuel işlem gerekli");
  expect(await inv(p.id)).toEqual({ quantity: 2, reserved: 0 }); // stok düşülmedi
});

test("ödeme sayfasından geri dönüp yeniden sipariş: önceki kapatılır, tek stok ayırması kalır", async ({ page }) => {
  const email = await customer();
  const p = await insertProduct({ categoryId: await sub(), price: 60, stock: 5 });
  await loginCustomer(page, email);
  await addToCart(page, p.slug);
  await placeOrder(page);
  await q(`UPDATE orders SET "createdAt" = "createdAt" - interval '1 minute' WHERE "customerEmail" = $1`, [email]); // çift tıklama penceresinin dışı
  await placeOrder(page);
  const os = await orders(email);
  expect(os.map((o) => o.status)).toEqual(["CANCELLED", "PENDING_PAYMENT"]);
  expect(await inv(p.id)).toEqual({ quantity: 5, reserved: 1 });
});

test("çift tıklama / iki sekme: aynı sipariş ikinci kez oluşturulmaz", async ({ browser }) => {
  const email = await customer();
  const p = await insertProduct({ categoryId: await sub(), price: 70, stock: 5 });
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await loginCustomer(a, email);
  await addToCart(a, p.slug);
  const b = await ctx.newPage();
  for (const pg of [a, b]) {
    await pg.goto("/odeme");
    await pg.getByTestId("checkout-form").locator('[name="terms"]').check();
  }
  await Promise.all([a.getByTestId("place-order").click(), b.getByTestId("place-order").click()]);
  await expect.poll(async () => (await orders(email)).length).toBeGreaterThan(0);
  await a.waitForTimeout(1500);
  const os = await orders(email);
  expect(os.filter((o) => o.status === "PENDING_PAYMENT")).toHaveLength(1);
  expect(await inv(p.id)).toEqual({ quantity: 5, reserved: 1 });
  await ctx.close();
});

test("son ürünü iki müşteri aynı anda satın almaya çalışır: yalnız biri ayırır, stok eksiye düşmez", async ({ browser }) => {
  const p = await insertProduct({ categoryId: await sub(), price: 300, stock: 1 });
  const pages: Page[] = [];
  const emails: string[] = [];
  for (let i = 0; i < 2; i++) {
    const email = await customer();
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await loginCustomer(pg, email);
    await addToCart(pg, p.slug);
    await pg.goto("/odeme");
    await pg.getByTestId("checkout-form").locator('[name="terms"]').check();
    pages.push(pg);
    emails.push(email);
  }
  await Promise.all(pages.map((pg) => pg.getByTestId("place-order").click()));
  await expect.poll(async () => (await inv(p.id)).reserved).toBe(1);
  await pages[0].waitForTimeout(1500);
  const all = [...(await orders(emails[0])), ...(await orders(emails[1]))];
  expect(all.filter((o) => o.status === "PENDING_PAYMENT")).toHaveLength(1);
  expect(await inv(p.id)).toEqual({ quantity: 1, reserved: 1 });
  for (const pg of pages) await pg.context().close();
});
