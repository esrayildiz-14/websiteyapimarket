// Faz 3 / P0-1: Depolar, depolar arası transfer, mal çıkışı / hasar / fire — gerçek sunucu ve test veritabanı.
import { test, expect } from "@playwright/test";
import { insertProduct, login, q, STAFF, uniq } from "./helpers";

test.describe.configure({ mode: "serial" });

const sub = async () => (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0].id;
const inv = async (productId: string) =>
  (await q<{ quantity: number; reserved: number }>(`SELECT quantity, reserved FROM inventory WHERE "productId" = $1`, [productId]))[0];
const ws = async (productId: string, code: string) =>
  (await q<{ quantity: number }>(
    `SELECT s.quantity FROM warehouse_stocks s JOIN inventory i ON i.id = s."inventoryId" JOIN warehouses w ON w.id = s."warehouseId"
     WHERE i."productId" = $1 AND w.code = $2`, [productId, code]))[0]?.quantity ?? 0;

let code = "";
let whId = "";
let p: { id: string; sku: string; slug: string };

test("varsayılan Merkez Depo listede; mevcut stoklar depo toplamıyla uyuşuyor", async ({ page }) => {
  await login(page);
  await page.goto("/admin/depolar");
  await expect(page.getByTestId("warehouse-row-MERKEZ")).toContainText("varsayılan");
  await expect(page.getByTestId("stock-mismatch")).toHaveCount(0);
});

test("yeni depo eklenir; aynı kod ikinci kez kullanılamaz, hatalı kod reddedilir", async ({ page }) => {
  code = uniq("MAGAZA").replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  await login(page);
  await page.goto("/admin/depolar");
  const f = page.getByTestId("warehouse-form");
  await f.locator('[name="code"]').fill("çok kötü kod!");
  await f.locator('[name="name"]').fill("Hatalı");
  await page.getByTestId("warehouse-submit").click();
  await expect(page.getByTestId("err-code")).toContainText("harf, rakam");
  await f.locator('[name="code"]').fill(code);
  await f.locator('[name="name"]').fill("Mağaza Deposu");
  await page.getByTestId("warehouse-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("oluşturuldu");
  await expect(page.getByTestId(`warehouse-row-${code}`)).toContainText("Kapalı"); // online satış varsayılan kapalı
  whId = (await q<{ id: string }>(`SELECT id FROM warehouses WHERE code = $1`, [code]))[0].id;

  const g = page.getByTestId("warehouse-form");
  await g.locator('[name="code"]').fill(code.toLowerCase());
  await g.locator('[name="name"]').fill("Kopya");
  await page.getByTestId("warehouse-submit").click();
  await expect(page.getByTestId("err-code")).toContainText("kullanılıyor");
});

test("transfer: Merkez → mağaza deposu; sitede satılabilir stok düşer, hareketler yazılır", async ({ page }) => {
  p = await insertProduct({ categoryId: await sub(), stock: 10 });
  await login(page);
  await page.goto("/admin/depolar");
  const f = page.getByTestId("transfer-form");
  await f.locator('[name="code"]').fill(p.sku);
  await f.locator('[name="fromId"]').selectOption("wh_merkez");
  await f.locator('[name="toId"]').selectOption(whId);
  await f.locator('[name="quantity"]').fill("4");
  await page.getByTestId("transfer-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("Kalan 6, hedefte 4");
  expect(await inv(p.id)).toEqual({ quantity: 6, reserved: 0 });
  expect(await ws(p.id, "MERKEZ")).toBe(6);
  expect(await ws(p.id, code)).toBe(4);
  const mv = await q<{ type: string; quantity: number }>(
    `SELECT type::text, quantity FROM inventory_movements WHERE "productId" = $1 ORDER BY "createdAt"`, [p.id]);
  expect(mv).toEqual([{ type: "TRANSFER_OUT", quantity: -4 }, { type: "TRANSFER_IN", quantity: 4 }]);
  await expect(page.getByTestId("warehouse-movements")).toContainText("Transfer girişi");

  // depodaki ürün listesi barkod/kod araması
  await page.goto(`/admin/depolar/${whId}?q=${p.sku}`);
  await expect(page.getByTestId(`ws-row-${p.sku}`).getByTestId("qty")).toHaveText("4");
});

test("depoda olmayan adet transfer edilemez; aynı depo seçilemez", async ({ page }) => {
  await login(page);
  await page.goto("/admin/depolar");
  let f = page.getByTestId("transfer-form");
  await f.locator('[name="code"]').fill(p.sku);
  await f.locator('[name="fromId"]').selectOption(whId);
  await f.locator('[name="toId"]').selectOption("wh_merkez");
  await f.locator('[name="quantity"]').fill("99");
  await page.getByTestId("transfer-submit").click();
  await expect(page.getByTestId("flash-err")).toContainText("yeterli stok yok");
  f = page.getByTestId("transfer-form");
  await f.locator('[name="code"]').fill(p.sku);
  await f.locator('[name="fromId"]').selectOption(whId);
  await f.locator('[name="toId"]').selectOption(whId);
  await f.locator('[name="quantity"]').fill("1");
  await page.getByTestId("transfer-submit").click();
  await expect(page.getByTestId("flash-err")).toContainText("aynı olamaz");
  expect(await ws(p.id, code)).toBe(4);
});

test("hasar / fire: açıklama zorunlu; kayıt depodan düşer", async ({ page }) => {
  await login(page);
  await page.goto("/admin/depolar");
  let f = page.getByTestId("issue-form");
  await f.locator('[name="code"]').fill(p.sku);
  await f.locator('[name="warehouseId"]').selectOption(whId);
  await f.locator('[name="kind"]').selectOption("DAMAGE_OUT");
  await f.locator('[name="quantity"]').fill("1");
  await f.locator('[name="note"]').evaluate((el: HTMLInputElement) => el.removeAttribute("required"));
  await f.locator('[name="note"]').evaluate((el: HTMLInputElement) => el.removeAttribute("minlength"));
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("flash-err")).toContainText("açıklama zorunludur");
  f = page.getByTestId("issue-form");
  await f.locator('[name="code"]').fill(p.sku);
  await f.locator('[name="warehouseId"]').selectOption(whId);
  await f.locator('[name="kind"]').selectOption("DAMAGE_OUT");
  await f.locator('[name="quantity"]').fill("1");
  await f.locator('[name="note"]').fill("Kutu ezik geldi");
  await page.getByTestId("issue-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("hasarlı ürün kaydedildi");
  expect(await ws(p.id, code)).toBe(3);
  expect(await inv(p.id)).toEqual({ quantity: 6, reserved: 0 }); // online olmayan depo: satılabilir stok değişmez
  const last = (await q<{ type: string; note: string }>(
    `SELECT type::text, note FROM inventory_movements WHERE "productId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [p.id]))[0];
  expect(last).toEqual({ type: "DAMAGE_OUT", note: "Hasarlı ürün: Kutu ezik geldi" });
});

test("depo online satışa açılınca stoğu satılabilire eklenir, kapatılınca çıkar; stoklu depo pasife alınamaz", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/depolar/${whId}`);
  const f = page.getByTestId("warehouse-edit-form");
  await f.locator('[name="sellsOnline"]').check();
  await page.getByTestId("warehouse-edit-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("güncellendi");
  expect(await inv(p.id)).toEqual({ quantity: 9, reserved: 0 });

  // ödeme bekleyen 8 adet varken depo kapatılamaz (kalan 6 < 8)
  await q(`UPDATE inventory SET reserved = 8 WHERE "productId" = $1`, [p.id]);
  await page.getByTestId("warehouse-edit-form").locator('[name="sellsOnline"]').uncheck();
  await page.getByTestId("warehouse-edit-submit").click();
  await expect(page.getByTestId("form-message")).toContainText("ödeme bekleyen");
  await q(`UPDATE inventory SET reserved = 0 WHERE "productId" = $1`, [p.id]);
  await page.goto(`/admin/depolar/${whId}`); // önceki "güncellendi" mesajı ekranda kalmasın
  await page.getByTestId("warehouse-edit-form").locator('[name="sellsOnline"]').uncheck();
  await page.getByTestId("warehouse-edit-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("güncellendi");
  expect(await inv(p.id)).toEqual({ quantity: 6, reserved: 0 });

  await page.goto(`/admin/depolar/${whId}`);
  await page.getByTestId("warehouse-edit-form").locator('[name="isActive"]').uncheck();
  await page.getByTestId("warehouse-edit-submit").click();
  await expect(page.getByTestId("form-message")).toContainText("Depoda");
  expect((await q<{ isActive: boolean }>(`SELECT "isActive" FROM warehouses WHERE id = $1`, [whId]))[0].isActive).toBe(true);
});

test("stok ekranından seçilen depoya sayım yapılır", async ({ page }) => {
  await login(page);
  await page.goto("/admin/stok");
  const f = page.getByTestId("stock-form");
  await f.locator('[name="sku"]').fill(p.sku);
  await f.locator('[name="mode"]').selectOption("count");
  await f.locator('[name="quantity"]').fill("5");
  await f.locator('[name="warehouseId"]').selectOption(whId);
  await page.getByTestId("stock-submit").click();
  await expect(page.getByTestId("flash-ok")).toContainText("depodaki yeni stok 5");
  expect(await ws(p.id, code)).toBe(5);
  expect(await inv(p.id)).toEqual({ quantity: 6, reserved: 0 });
});

test("sipariş personeli depo işlemi yapamaz", async ({ page }) => {
  await login(page, STAFF);
  await page.goto("/admin/depolar");
  await expect(page.getByTestId("warehouse-table")).toBeVisible();
  await expect(page.getByTestId("transfer-form")).toHaveCount(0);
  await expect(page.getByTestId("issue-form")).toHaveCount(0);
});
