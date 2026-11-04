// QA: API ve form uçlarına bozuk / kötü niyetli girdiler — sunucu 500 vermez, veri değişmez.
import { test, expect } from "@playwright/test";
import { insertProduct, q } from "./helpers";

async function anyCategory() {
  return (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
}

test("adres API: geçersiz il/ilçe değerleri 500 vermez", async ({ request }) => {
  for (const qs of ["il=abc", "il=999", "il=-1", "il=1.5", "ilce=abc", "ilce=999999999", "il=1%27%20OR%201%3D1", "ilce=0"]) {
    const r = await request.get(`/api/adres?${qs}`, { headers: { "X-Forwarded-For": "203.0.113.77" } });
    expect(r.status(), qs).toBe(200);
    expect(Array.isArray(await r.json()), qs).toBe(true);
  }
  const none = await (await request.get("/api/adres?ilce=999999999", { headers: { "X-Forwarded-For": "203.0.113.78" } })).json();
  expect(none).toEqual([]);
});

test("ödeme geri dönüş uçları: yanlış yöntem, eksik / bozuk / bilinmeyen token reddedilir", async ({ request }) => {
  expect((await request.get("/api/odeme/iyzico")).status()).toBe(405);
  expect((await request.post("/api/odeme/iyzico")).status()).toBe(400);
  expect((await request.post("/api/odeme/iyzico", { form: { token: "<script>alert(1)</script>" } })).status()).toBe(400);
  expect((await request.post("/api/odeme/iyzico", { form: { token: "x".repeat(500) } })).status()).toBe(400);
  expect((await request.post("/api/odeme/iyzico", { form: { token: "bilinmeyen-token-123456" }, maxRedirects: 0 })).status()).toBe(404);
  // test sağlayıcısı: form yerine JSON / boş gövde
  expect((await request.post("/api/odeme/test", { data: { token: "x" } })).status()).toBe(400);
  expect((await request.post("/api/odeme/test")).status()).toBe(400);
  expect((await request.post("/api/odeme/test", { form: { token: "bilinmeyen", sonuc: "basarili" }, maxRedirects: 0 })).status()).toBe(404);
});

test("olmayan API ve sayfa 404 döner", async ({ request }) => {
  expect((await request.get("/api/yok")).status()).toBe(404);
  expect((await request.get("/urun/olmayan-urun-xyz")).status()).toBe(404);
  expect((await request.get("/kategori/olmayan-kategori-xyz")).status()).toBe(404);
});

test("sepete ekleme formu tarayıcıda değiştirilse de sunucu adet ve ürünü doğrular", async ({ page }) => {
  const p = await insertProduct({ categoryId: await anyCategory(), stock: 4, price: 250 });
  const draft = await insertProduct({ categoryId: await anyCategory(), stock: 10 });
  await q(`UPDATE products SET status = 'PASSIVE' WHERE id = $1`, [draft.id]);
  const form = page.getByTestId("add-to-cart");

  async function submitWith(qty: string, productId?: string) {
    await page.goto(`/urun/${p.slug}`);
    await form.locator("#qty").evaluate((el, v) => {
      const i = el as HTMLInputElement;
      i.removeAttribute("min"); i.removeAttribute("max"); i.type = "text"; i.value = v;
    }, qty);
    if (productId) await form.locator('[name="productId"]').evaluate((el, v) => ((el as HTMLInputElement).value = v), productId);
    await form.getByRole("button", { name: "Sepete ekle" }).click();
  }

  for (const bad of ["-3", "0", "2.5", "abc", "100000"]) {
    await submitWith(bad);
    await expect(page.getByTestId("flash-err"), bad).toContainText("Adet 1 ile 999");
  }
  await submitWith("1", draft.id);
  await expect(page.getByTestId("flash-err")).toContainText("satışta değil");
  await submitWith("1", "olmayan-urun-id");
  await expect(page.getByTestId("flash-err")).toContainText("satışta değil");

  // stoktan fazlası istenirse stok kadarına indirilir; fiyat her zaman veritabanından gelir
  await submitWith("50");
  await expect(page).toHaveURL(/\/sepet/);
  await expect(page.getByText("Stokta 4 adet var")).toBeVisible();
  await expect(page.getByTestId("cart-link")).toContainText("(4)");
});
