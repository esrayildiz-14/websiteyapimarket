// Faz 3 / P0-2,3: tedarikçi yönetimi, satın alma ve mal kabul — gerçek sunucu ve test veritabanı.
import { test, expect } from "@playwright/test";
import { insertProduct, login, q, STAFF, uniq } from "./helpers";

test.describe.configure({ mode: "serial" });

const sub = async () => (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
const inv = async (id: string) => (await q<{ quantity: number }>(`SELECT quantity FROM inventory WHERE "productId" = $1`, [id]))[0].quantity;

const code = uniq("TED").replace(/[^A-Z0-9-]/g, "").slice(0, 20);
let supplierId = "";
let poId = "";
let p: { id: string; sku: string; slug: string };

test("tedarikçi kaydı: hatalı vergi no ve e-posta reddedilir; kayıt oluşur; aynı kod ikinci kez kullanılamaz", async ({ page }) => {
  await login(page);
  await page.goto("/admin/tedarikciler");
  const f = page.getByTestId("supplier-form");
  await f.locator('[name="code"]').fill(code);
  await f.locator('[name="name"]').fill("Anadolu Hırdavat Ltd.");
  await f.locator('[name="taxNumber"]').fill("12345");
  await f.locator('[name="email"]').fill("gecersiz-eposta");
  await page.getByTestId("supplier-submit").click();
  await expect(page.getByTestId("err-taxNumber")).toContainText("10 haneli");
  await expect(page.getByTestId("err-email")).toBeVisible();
  await f.locator('[name="taxNumber"]').fill("1234567890");
  await f.locator('[name="email"]').fill("satis@anadolu.test");
  await f.locator('[name="contactName"]').fill("Mehmet Demir");
  await f.locator('[name="paymentTerms"]').fill("30 gün vadeli");
  await f.locator('[name="avgLeadDays"]').fill("3");
  await page.getByTestId("supplier-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("kaydedildi");
  supplierId = (await q<{ id: string }>(`SELECT id FROM suppliers WHERE code = $1`, [code]))[0].id;

  await page.goto("/admin/tedarikciler");
  const g = page.getByTestId("supplier-form");
  await g.locator('[name="code"]').fill(code.toLowerCase());
  await g.locator('[name="name"]').fill("Kopya");
  await page.getByTestId("supplier-submit").click();
  await expect(page.getByTestId("err-code")).toContainText("kullanılıyor");
  await expect(page.getByTestId(`supplier-row-${code}`)).toContainText("Anadolu Hırdavat");
});

test("tedarikçiye ürün ve alış koşulları bağlanır; tekrar kaydedince güncellenir", async ({ page }) => {
  p = await insertProduct({ categoryId: await sub(), stock: 2, price: 250 });
  await login(page);
  await page.goto(`/admin/tedarikciler/${supplierId}`);
  const f = page.getByTestId("sp-form");
  await f.locator('[name="code"]').fill(p.sku);
  await f.locator('[name="supplierSku"]').fill("AH-778");
  await f.locator('[name="purchasePrice"]').fill("120,00");
  await f.locator('[name="discountPct"]').fill("5");
  await f.locator('[name="minOrderQty"]').fill("6");
  await page.getByTestId("sp-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("eklendi");
  await page.getByTestId("sp-form").locator('[name="code"]').fill(p.sku);
  await page.getByTestId("sp-form").locator('[name="purchasePrice"]').fill("110");
  await page.getByTestId("sp-form").locator('[name="discountPct"]').fill("0");
  await page.getByTestId("sp-form").locator('[name="minOrderQty"]').fill("6");
  await page.getByTestId("sp-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("güncellendi");
  await expect(page.getByTestId(`sp-row-${p.sku}`).getByTestId("sp-price")).toContainText("110,00");
  expect(await q(`SELECT 1 FROM supplier_products WHERE "supplierId" = $1`, [supplierId])).toHaveLength(1);
});

test("satın alma: taslak → ürün (tedarikçi fiyatı) → onaya gönder → onay; sipariş stoğu değiştirmez", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/satin-alma?yeni=1&tedarikci=${supplierId}`);
  const f = page.getByTestId("po-create-form");
  await f.locator('[name="warehouseId"]').selectOption("wh_merkez");
  await f.locator('[name="expectedAt"]').fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
  await page.getByTestId("po-create-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("taslak");
  poId = page.url().split("/admin/satin-alma/")[1].split("?")[0];
  await expect(page.getByTestId("po-status")).toHaveText("Taslak");

  await page.getByTestId("po-item-form").locator('[name="code"]').fill(p.sku);
  await page.getByTestId("po-item-form").locator('[name="quantity"]').fill("4");
  await page.getByTestId("po-item-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("en az sipariş adedi 6");
  await page.getByTestId("po-item-form").locator('[name="code"]').fill(p.sku);
  await page.getByTestId("po-item-form").locator('[name="quantity"]').fill("6");
  await page.getByTestId("po-item-submit").click();
  await expect(page.getByTestId(`po-item-${p.sku}`).getByTestId("qty")).toHaveText("10");
  // 10 × 110 = 1.100 + %20 KDV = 1.320
  await expect(page.getByTestId("po-subtotal")).toContainText("1.100,00");
  await expect(page.getByTestId("po-total")).toContainText("1.320,00");

  await page.getByTestId("po-submit").click();
  await expect(page.getByTestId("po-status")).toHaveText("Onay bekliyor");
  await expect(page.getByTestId("po-item-form")).toHaveCount(0); // onaydaki sipariş değiştirilemez
  await page.getByTestId("po-approve").click();
  await expect(page.getByTestId("po-status")).toHaveText("Tedarikçiye iletildi");
  expect(await inv(p.id)).toBe(2);
});

test("mal kabul: fazla adet reddedilir; kısmi kabul stoğu artırır; kalan kabul ile tam teslim", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/satin-alma/${poId}`);
  const item = (await q<{ id: string }>(`SELECT id FROM purchase_order_items WHERE "purchaseOrderId" = $1`, [poId]))[0].id;
  let f = page.getByTestId("receive-form");
  await f.locator('[name="documentNo"]').fill("IRS-2026-001");
  await f.locator(`[name="qty_${item}"]`).evaluate((el: HTMLInputElement) => el.removeAttribute("max"));
  await f.locator(`[name="qty_${item}"]`).fill("12");
  await page.getByTestId("receive-submit").click();
  await expect(page.getByTestId("flash-err")).toContainText("en fazla 10");
  expect(await inv(p.id)).toBe(2);

  f = page.getByTestId("receive-form");
  await f.locator('[name="documentNo"]').fill("IRS-2026-001");
  await f.locator(`[name="qty_${item}"]`).fill("4");
  await page.getByTestId("receive-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("kısmi teslim");
  await expect(page.getByTestId("po-status")).toHaveText("Kısmi teslim edildi");
  await expect(page.getByTestId(`po-item-${p.sku}`).getByTestId("received")).toHaveText("4");
  expect(await inv(p.id)).toBe(6);
  const mv = await q<{ type: string; quantity: number; note: string; r: string | null }>(
    `SELECT m.type::text, m.quantity, m.note, m."goodsReceiptId" AS r FROM inventory_movements m WHERE m."productId" = $1 AND m."goodsReceiptId" IS NOT NULL`, [p.id]);
  expect(mv).toHaveLength(1);
  expect(mv[0]).toMatchObject({ type: "PURCHASE_IN", quantity: 4 });
  expect(mv[0].note).toContain("IRS-2026-001");

  f = page.getByTestId("receive-form");
  await f.locator('[name="documentType"]').selectOption("FATURA");
  await f.locator('[name="documentNo"]').fill("FTR-55");
  await f.locator(`[name="qty_${item}"]`).fill("6");
  await page.getByTestId("receive-submit").click();
  await expect(page.getByTestId("po-status")).toHaveText("Tam teslim edildi");
  await expect(page.getByTestId("receive-form")).toHaveCount(0);
  await expect(page.getByTestId("receipts")).toContainText("FTR-55");
  expect(await inv(p.id)).toBe(12);
  const cost = (await q<{ c: string }>(`SELECT "avgCost"::text c FROM products WHERE id = $1`, [p.id]))[0].c;
  expect(Number(cost)).toBe(110); // eski stoğun maliyeti bilinmiyordu → mal kabul maliyeti
});

test("tedarikçi performansı ve son alış bilgisi mal kabullerden hesaplanır", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/tedarikciler/${supplierId}`);
  await expect(page.getByTestId("perf-orders")).toHaveText("1");
  await expect(page.getByTestId("perf-value")).toContainText("1.100,00");
  await expect(page.getByTestId("perf-ontime")).toContainText("%100");
  await expect(page.getByTestId("perf-fill")).toHaveText("%100");
  await expect(page.getByTestId(`sp-row-${p.sku}`).getByTestId("sp-last")).toContainText("110,00");
});

test("sipariş personeli tedarik ekranlarına giremez", async ({ page }) => {
  await login(page, STAFF);
  for (const url of ["/admin/tedarikciler", "/admin/satin-alma", `/admin/satin-alma/${poId}`]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/admin\?hata=/);
  }
});
