// Güvenlik kontrolleri — gerçek sunucu üzerinde.
import { test, expect } from "@playwright/test";
import { insertProduct, q } from "./helpers";

test("güvenlik başlıkları tüm sayfalarda var", async ({ request }) => {
  for (const url of ["/", "/admin/giris", "/sepet"]) {
    const h = (await request.get(url)).headers();
    expect(h["x-frame-options"], url).toBe("DENY");
    expect(h["x-content-type-options"], url).toBe("nosniff");
    expect(h["referrer-policy"], url).toBeTruthy();
    expect(h["x-powered-by"], url).toBeUndefined();
  }
});

test("oturumsuz admin uç noktaları ve şablon indirme kapalı", async ({ request }) => {
  for (const url of ["/admin", "/admin/siparisler", "/admin/kargo", "/admin/sablon-urun", "/admin/icerik"]) {
    const r = await request.get(url, { maxRedirects: 0 });
    expect([302, 303, 307, 308], url).toContain(r.status());
    expect(r.headers()["location"], url).toContain("/admin/giris");
  }
});

test("sahte admin çerezi panele erişim sağlamaz", async ({ page, context }) => {
  await context.addCookies([{ name: "oy_admin", value: "sahte-token", url: "http://localhost:3100" }]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/giris/);
});

test("ürün adındaki HTML/JS kaçışlanır (XSS yok)", async ({ page }) => {
  const cat = (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL LIMIT 1`))[0].id;
  const p = await insertProduct({ categoryId: cat, name: `<img src=x onerror="window.__xss=1"> Test` });
  let dialog = false;
  page.on("dialog", (d) => {
    dialog = true;
    void d.dismiss();
  });
  await page.goto(`/urun/${p.slug}`);
  await expect(page.getByTestId("product-name")).toContainText("<img src=x");
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(dialog).toBe(false);
});

test("arama girdisi SQL olarak yorumlanmaz", async ({ page }) => {
  const r = await page.goto(`/arama?q=${encodeURIComponent("' OR 1=1 --")}`);
  expect(r?.status()).toBe(200);
  await expect(page.getByTestId("result-count")).toHaveText("0 ürün");
});

test("başkasının sipariş sonucu ve sipariş takibi e-posta olmadan görüntülenemez", async ({ page }) => {
  const no = "OY" + Date.now().toString().slice(-12);
  await q(
    `INSERT INTO orders (id, "orderNumber", status, "paymentMethod", "customerName", "customerEmail", "customerPhone", "shippingAddress", "billingAddress",
       subtotal, "vatTotal", "grandTotal", "createdAt", "updatedAt")
     VALUES ($1, $2, 'PAID', 'CARD', 'Başka Müşteri', 'baska@test.local', '05320000000', '{}', '{}', 100, 16.67, 100, now(), now())`,
    ["sec" + no, no],
  );
  const o = { orderNumber: no };
  expect((await page.goto(`/siparis/${o.orderNumber}/sonuc`))?.status()).toBe(404);
  await page.goto(`/siparis-takip?no=${o.orderNumber}&e=yanlis@ornek.com`);
  await expect(page.getByTestId("track-result")).toHaveCount(0);
});

test("açık yönlendirme engellenir (giriş sonrası dış adrese gidilmez)", async ({ page }) => {
  await page.goto("/giris?devam=//kotu-site.example");
  await expect(page.locator('[data-testid="login-form"] [name="devam"]')).toHaveValue("/hesabim");
});

test("robots.txt canlı adres tanımlı değilken tüm siteyi kapatır; sitemap yalnız yayındaki ürünleri içerir", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  const cat = (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL LIMIT 1`))[0].id;
  const live = await insertProduct({ categoryId: cat });
  const hidden = await insertProduct({ categoryId: cat });
  await q(`UPDATE products SET status = 'PASSIVE' WHERE id = $1`, [hidden.id]);
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain(`/urun/${live.slug}`);
  expect(xml).not.toContain(`/urun/${hidden.slug}`);
  expect(xml).not.toContain("/sayfa/kvkk"); // hukuki onay almamış metin dizine eklenmez
});

test("Content-Security-Policy: her istekte farklı nonce; sayfa betikleri nonce taşır ve sayfa çalışır", async ({ page, request }) => {
  const a = (await request.get("/")).headers()["content-security-policy"];
  const b = (await request.get("/")).headers()["content-security-policy"];
  expect(a).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(a).toContain("frame-ancestors 'none'");
  expect(a).not.toBe(b);
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(m.text()); });
  await page.goto("/sepet");
  const nonce = /'nonce-([^']+)'/.exec((await page.request.get("/sepet")).headers()["content-security-policy"])![1];
  expect(nonce).toBeTruthy();
  const scripts = await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((n) => (n ?? "").length > 0)).toBe(true);
  await page.goto("/admin/giris");
  await expect(page.getByRole("button", { name: "Giriş yap" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("hız sınırı: aynı istemciden aşırı adres sorgusu 429 döner, başka istemci etkilenmez", async ({ request }) => {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const statuses: number[] = [];
  for (let i = 0; i < 65; i++) statuses.push((await request.get("/api/adres", { headers: { "X-Forwarded-For": ip } })).status());
  expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
  expect(statuses.slice(60)).toEqual([429, 429, 429, 429, 429]);
  const blocked = await request.get("/api/adres", { headers: { "X-Forwarded-For": ip } });
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await request.get("/api/adres", { headers: { "X-Forwarded-For": "198.51.100.250" } })).status()).toBe(200);
});
