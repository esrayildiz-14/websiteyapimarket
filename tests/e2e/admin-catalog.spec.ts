// Kategori, alt kategori ve marka yönetimi — gerçek sunucu ve test veritabanı üzerinde.
import { test, expect } from "@playwright/test";
import { insertProduct, login, q, uniq } from "./helpers";

type Cat = { id: string; slug: string; parentId: string | null; isActive: boolean; sortOrder: number };
const catByName = async (name: string) => (await q<Cat>(`SELECT id, slug, "parentId", "isActive", "sortOrder" FROM categories WHERE name = $1`, [name]))[0];

test.describe("Kategori yönetimi", () => {
  test.describe.configure({ mode: "serial" });
  const MAIN = `Test Ana ${uniq("K")}`;
  const SUB = "Test Alt Kategori";

  test("ana kategori eklenir ve sitede açılır", async ({ page }) => {
    await login(page);
    await page.goto("/admin/kategoriler/yeni");
    await page.locator('[data-testid="category-form"] [name="name"]').fill(MAIN);
    await page.locator('[data-testid="category-form"] [name="seoTitle"]').fill(`${MAIN} | Öner Yapı`);
    await page.locator('[data-testid="category-form"] [name="description"]').fill("Test açıklaması");
    await page.getByTestId("category-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Kategori kaydedildi");
    const c = await catByName(MAIN);
    expect(c.parentId).toBeNull();
    await expect(page.getByTestId(`cat-row-${c.slug}`)).toBeVisible();
    expect((await page.goto(`/kategori/${c.slug}`))?.status()).toBe(200);
  });

  test("alt kategori eklenir; adresi üst kategoriden türetilir", async ({ page }) => {
    const main = await catByName(MAIN);
    await login(page);
    await page.goto(`/admin/kategoriler/yeni?ust=${main.id}`);
    await expect(page.locator('[data-testid="category-form"] [name="parentId"]')).toHaveValue(main.id);
    await page.locator('[data-testid="category-form"] [name="name"]').fill(SUB);
    await page.getByTestId("category-submit").click();
    await expect(page.getByTestId("flash-ok")).toBeVisible();
    const sub = (await q<Cat>(`SELECT id, slug, "parentId" FROM categories WHERE name = $1 AND "parentId" = $2`, [SUB, main.id]))[0];
    expect(sub.slug).toBe(`${main.slug}-test-alt-kategori`);
  });

  test("aynı seviyede aynı ad ve üçüncü seviye reddedilir", async ({ page }) => {
    const main = await catByName(MAIN);
    const sub = (await q<Cat>(`SELECT id FROM categories WHERE "parentId" = $1`, [main.id]))[0];
    await login(page);
    await page.goto(`/admin/kategoriler/yeni?ust=${main.id}`);
    await page.locator('[data-testid="category-form"] [name="name"]').fill(SUB);
    await page.getByTestId("category-submit").click();
    await expect(page.getByTestId("err-name")).toBeVisible();
    // üçüncü seviye: alt kategori seçeneklerde yok, elle gönderilirse sunucu reddeder
    const options = await page.locator('[data-testid="category-form"] [name="parentId"] option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(options).not.toContain(sub.id);
    await page.locator('[data-testid="category-form"] [name="parentId"]').evaluate((el, v) => {
      const o = document.createElement("option");
      o.value = v;
      el.appendChild(o);
      (el as HTMLSelectElement).value = v;
    }, sub.id);
    await page.locator('[data-testid="category-form"] [name="name"]').fill("Üçüncü seviye");
    await page.getByTestId("category-submit").click();
    await expect(page.getByTestId("err-parentId")).toContainText("iki seviye");
  });

  test("ürünü olan kategori silinemez; pasif ana kategori ürünleri sitede gizler", async ({ page }) => {
    const main = await catByName(MAIN);
    const sub = (await q<Cat>(`SELECT id, slug FROM categories WHERE "parentId" = $1`, [main.id]))[0];
    const p = await insertProduct({ categoryId: sub.id });
    expect((await page.goto(`/urun/${p.slug}`))?.status()).toBe(200);

    await login(page);
    await page.goto(`/admin/kategoriler/${sub.id}`);
    await page.getByRole("button", { name: "Kategoriyi sil" }).click();
    await expect(page.getByTestId("flash-err")).toContainText("ürün kaydı var");
    expect(await q(`SELECT 1 FROM categories WHERE id = $1`, [sub.id])).toHaveLength(1);

    await page.goto("/admin/kategoriler");
    await page.getByTestId(`cat-row-${main.slug}`).getByRole("button", { name: "Pasif yap" }).click();
    await expect(page.getByTestId("flash-ok")).toBeVisible();
    expect((await catByName(MAIN)).isActive).toBe(false);
    expect((await page.goto(`/urun/${p.slug}`))?.status()).toBe(404);
    expect((await page.goto(`/kategori/${main.slug}`))?.status()).toBe(404);

    await page.goto("/admin/kategoriler");
    await page.getByTestId(`cat-row-${main.slug}`).getByRole("button", { name: "Aktif yap" }).click();
    await expect(page.getByTestId("flash-ok")).toBeVisible();
    expect((await page.goto(`/urun/${p.slug}`))?.status()).toBe(200);
  });

  test("ürünü doğrudan bağlı kategoriye alt kategori eklenemez", async ({ page }) => {
    const lone = await q<{ id: string }>(
      `INSERT INTO categories (id, name, slug, "sortOrder", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $1, 999, true, now(), now()) RETURNING id`, [uniq("tek").toLowerCase(), `Tek ${uniq("K")}`]);
    await insertProduct({ categoryId: lone[0].id });
    await login(page);
    await page.goto(`/admin/kategoriler/yeni?ust=${lone[0].id}`);
    await page.locator('[data-testid="category-form"] [name="name"]').fill("Yeni alt");
    await page.getByTestId("category-submit").click();
    await expect(page.getByTestId("err-parentId")).toContainText("doğrudan");
  });

  test("sıralama: aşağı taşınan kategori komşusuyla yer değiştirir", async ({ page }) => {
    const mains = await q<{ id: string; slug: string }>(`SELECT id, slug FROM categories WHERE "parentId" IS NULL ORDER BY "sortOrder", name LIMIT 2`);
    await login(page);
    await page.goto("/admin/kategoriler");
    await page.getByTestId(`cat-row-${mains[0].slug}`).getByRole("button", { name: /aşağı taşı/ }).click();
    await expect
      .poll(async () => (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NULL ORDER BY "sortOrder", name LIMIT 2`)).map((r) => r.id))
      .toEqual([mains[1].id, mains[0].id]);
  });

  test("boş alt kategori silinir", async ({ page }) => {
    const main = await catByName(MAIN);
    await login(page);
    await page.goto(`/admin/kategoriler/yeni?ust=${main.id}`);
    await page.locator('[data-testid="category-form"] [name="name"]').fill("Silinecek alt");
    await page.getByTestId("category-submit").click();
    await expect(page.getByTestId("flash-ok")).toBeVisible();
    const c = (await q<Cat>(`SELECT id FROM categories WHERE name = 'Silinecek alt' AND "parentId" = $1`, [main.id]))[0];
    await page.goto(`/admin/kategoriler/${c.id}`);
    await page.getByRole("button", { name: "Kategoriyi sil" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Kategori silindi");
    expect(await q(`SELECT 1 FROM categories WHERE id = $1`, [c.id])).toHaveLength(0);
  });
});

test.describe("Marka yönetimi", () => {
  test("marka eklenir, aynı ad reddedilir, ürünsüz marka silinir, ürünlü marka silinemez", async ({ page }) => {
    const NAME = `Test Marka ${uniq("M")}`;
    await login(page);
    await page.goto("/admin/markalar");
    await page.locator('[data-testid="brand-form"] [name="name"]').fill(NAME);
    await page.getByTestId("brand-submit").click();
    await expect(page.getByTestId("flash-ok")).toContainText("Marka kaydedildi");
    const b = (await q<{ id: string; slug: string }>(`SELECT id, slug FROM brands WHERE name = $1`, [NAME]))[0];
    await expect(page.getByTestId(`brand-row-${b.slug}`)).toBeVisible();

    await page.locator('[data-testid="brand-form"] [name="name"]').fill(NAME.toUpperCase());
    await page.getByTestId("brand-submit").click();
    await expect(page.getByTestId("err-name")).toBeVisible();

    const sub = (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL LIMIT 1`))[0];
    await insertProduct({ categoryId: sub.id, brandId: b.id });
    await page.goto(`/admin/markalar/${b.id}`);
    await page.getByRole("button", { name: "Markayı sil" }).click();
    await expect(page.getByTestId("flash-err")).toContainText("silinemez");

    await q(`UPDATE products SET "brandId" = NULL WHERE "brandId" = $1`, [b.id]);
    await page.goto(`/admin/markalar/${b.id}`);
    await page.getByRole("button", { name: "Markayı sil" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Marka silindi");
    expect(await q(`SELECT 1 FROM brands WHERE id = $1`, [b.id])).toHaveLength(0);
  });

  test("ürün yöneticisi olmayan sipariş personeli kategori sayfasına erişemez", async ({ page }) => {
    const { STAFF } = await import("./helpers");
    await login(page, STAFF);
    await page.goto("/admin/kategoriler");
    await expect(page).toHaveURL(/\/admin\?hata=/);
  });
});
