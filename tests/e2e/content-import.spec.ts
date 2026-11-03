// İçerik yönetimi, SEO ve Excel ile toplu ürün içe aktarma.
import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { insertProduct, login, q, uniq } from "./helpers";

test("banner admin panelinden eklenir ve ana sayfada görünür", async ({ page }) => {
  const title = `Kampanya ${uniq("B")}`;
  await login(page);
  await page.goto("/admin/icerik?sekme=banner");
  const f = page.getByTestId("banner-new");
  await f.locator('[name="title"]').fill(title);
  await f.locator('[name="linkUrl"]').fill("https://kotu.example\" onmouseover=\"x");
  await f.getByRole("button", { name: "Banner ekle" }).click();
  await expect(page.getByTestId("flash-ok")).toBeVisible(); // https ile başladığı için kabul; React özelliği kaçışlar
  await page.goto("/admin/icerik?sekme=banner");
  const f2 = page.getByTestId("banner-new");
  await f2.locator('[name="title"]').fill(title + " 2");
  await f2.locator('[name="linkUrl"]').fill("javascript:alert(1)");
  await f2.getByRole("button", { name: "Banner ekle" }).click();
  await expect(page.getByTestId("flash-err")).toContainText("Bağlantı");
  await page.goto("/");
  await expect(page.getByTestId("banners")).toContainText(title);
});

test("hukuki sayfa: onaysız taslak uyarısı, onaydan sonra kalkar; içerik değişince onay düşer", async ({ page }) => {
  await page.goto("/sayfa/mesafeli-satis-sozlesmesi");
  await expect(page.getByTestId("legal-draft")).toBeVisible();
  const id = (await q<{ id: string }>(`SELECT id FROM pages WHERE slug = 'mesafeli-satis-sozlesmesi'`))[0].id;
  await login(page);
  await page.goto(`/admin/icerik?sekme=sayfa&duzenle=${id}`);
  await page.getByTestId("page-form").locator('[name="legalApproved"]').check();
  await page.getByTestId("page-form").getByRole("button", { name: "Sayfayı kaydet" }).click();
  await expect(page.getByTestId("flash-ok")).toBeVisible();
  await page.goto("/sayfa/mesafeli-satis-sozlesmesi");
  await expect(page.getByTestId("legal-draft")).toHaveCount(0);

  await page.goto(`/admin/icerik?sekme=sayfa&duzenle=${id}`);
  const ta = page.getByTestId("page-form").locator('[name="content"]');
  await ta.fill((await ta.inputValue()) + "\n\nEk madde.");
  await page.getByTestId("page-form").getByRole("button", { name: "Sayfayı kaydet" }).click();
  await expect(page.getByTestId("flash-ok")).toContainText("onayı işaretli değil");
  await page.goto("/sayfa/mesafeli-satis-sozlesmesi");
  await expect(page.getByTestId("legal-draft")).toBeVisible();
});

test("SSS sayfası, kategori SEO başlığı/görseli ve ürün yapılandırılmış verisi", async ({ page }) => {
  await page.goto("/sss");
  await expect(page.locator("details")).not.toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

  const main = (await q<{ slug: string; seoTitle: string; imageUrl: string }>(`SELECT slug, "seoTitle", "imageUrl" FROM categories WHERE name = 'El Aletleri' AND "parentId" IS NULL`))[0];
  expect(main.seoTitle).toContain("Öner Yapı Market");
  expect(main.imageUrl).toMatch(/^\/kategori\/.+\.svg$/);
  expect((await page.request.get(main.imageUrl)).status()).toBe(200);
  await page.goto(`/kategori/${main.slug}`);
  await expect(page).toHaveTitle(new RegExp(main.seoTitle.split(" |")[0]));

  const cat = (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL LIMIT 1`))[0].id;
  const p = await insertProduct({ categoryId: cat, price: 249.9 });
  await page.goto(`/urun/${p.slug}`);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(ld["@type"]).toBe("Product");
  expect(ld.sku).toBe(p.sku);
  expect(ld.offers.price).toBe("249.90");
  expect(ld.offers.priceCurrency).toBe("TRY");
  expect(ld.offers.availability).toContain("InStock");
});

test("Excel şablonu indirilir; kontrol kaydetmez; içe aktarma doğrulanmamış ürünü pasif yapar, hatalı satırı atlar", async ({ page }) => {
  await login(page);
  const tpl = await page.request.get("/admin/sablon-urun");
  expect(tpl.status()).toBe(200);
  expect(tpl.headers()["content-type"]).toContain("spreadsheetml");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await tpl.body()) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Ürünler")!;
  expect(wb.getWorksheet("Listeler")).toBeTruthy();
  const headers = (ws.getRow(1).values as string[]).filter(Boolean);
  expect(headers).toContain("Ürün kodu (SKU)*");
  expect(headers).toContain("Özellik 1 adı");

  const a = uniq("XLA"), b = uniq("XLB") + "B", c = uniq("XLC") + "C";
  ws.spliceRows(2, 1);
  const base = { main: "El Aletleri", sub: "Tornavidalar", brand: "Bosch", vatRate: 20, saleUnit: "Adet", stock: 7, weightKg: "0,4", widthCm: 4, heightCm: 3, lengthCm: 22, profile: "STD" };
  const col = (h: string) => headers.indexOf(h) + 1;
  const put = (r: number, v: Record<string, string | number>) => {
    const map: Record<string, string> = {
      sku: "Ürün kodu (SKU)*", name: "Ürün adı*", main: "Ana kategori*", sub: "Alt kategori", brand: "Marka", price: "Satış fiyatı (KDV dahil)*",
      vatRate: "KDV oranı (20/10/1/0)*", saleUnit: "Satış birimi*", stock: "Stok*", weightKg: "Ağırlık (kg)*", widthCm: "En (cm)*", heightCm: "Yükseklik (cm)*",
      lengthCm: "Boy (cm)*", profile: "Kargo profili (STD/AGIR/HACIM)*", status: "Durum (Aktif/Pasif)", verified: "Bilgiler doğrulandı (Evet/Hayır)",
      s1l: "Özellik 1 adı", s1v: "Özellik 1 değeri", model: "Model",
    };
    for (const [k, val] of Object.entries(v)) ws.getRow(r).getCell(col(map[k])).value = val;
  };
  put(2, { ...base, sku: a, name: "Excel tornavida doğrulanmış", price: "129,90", status: "Aktif", verified: "Evet", s1l: "Uç tipi", s1v: "PH2", model: "TX-100" });
  put(3, { ...base, sku: b, name: "Excel tornavida doğrulanmamış", price: "99,90", status: "Aktif", verified: "Hayır" });
  put(4, { ...base, sku: c, name: "Hatalı kategori", main: "Olmayan Kategori", price: "10" });
  const file = { name: "urunler.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await wb.xlsx.writeBuffer()) };

  await page.goto("/admin/urunler/ice-aktar");
  await page.getByTestId("import-form").locator('[name="file"]').setInputFiles(file);
  await page.getByTestId("import-check").click();
  await expect(page.getByTestId("import-summary")).toContainText("2 satır geçerli, 1 satır hatalı");
  await expect(page.getByTestId("import-results")).toContainText("Ana kategori bulunamadı");
  expect(await q(`SELECT 1 FROM products WHERE sku = ANY($1)`, [[a, b, c]])).toHaveLength(0);

  await page.getByTestId("import-apply").click();
  await expect(page.getByTestId("import-summary")).toContainText("2 satır kaydedildi, 1 satır hatalı");
  const rows = await q<{ sku: string; status: string; specs: unknown; model: string | null; stock: number }>(
    `SELECT p.sku, p.status::text, p.specs, p.model, i.quantity AS stock FROM products p JOIN inventory i ON i."productId" = p.id WHERE p.sku = ANY($1) ORDER BY p.sku`, [[a, b]]);
  expect(rows).toEqual([
    { sku: a, status: "ACTIVE", specs: [{ label: "Uç tipi", value: "PH2" }], model: "TX-100", stock: 7 },
    { sku: b, status: "PASSIVE", specs: [], model: null, stock: 7 },
  ]);
});
