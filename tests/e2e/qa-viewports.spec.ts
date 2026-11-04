// QA: 9 ekran genişliğinde yatay taşma yok; logo, arama, sepet ve kategori menüsü görünür / erişilebilir.
import { test, expect } from "@playwright/test";
import { insertProduct, q } from "./helpers";

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];

test("tüm ekran genişliklerinde temel sayfalar taşmaz ve başlık öğeleri kullanılabilir", async ({ page }) => {
  test.setTimeout(600_000);
  const cat = (await q<{ id: string; slug: string }>(`SELECT id, slug FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0];
  const p = await insertProduct({ categoryId: cat.id, stock: 3, name: "Çok uzun ürün adı: 18V kömürsüz akülü darbeli matkap vidalama seti, 2 akü, şarj cihazı ve taşıma çantası" });
  const pages = ["/", `/kategori/${cat.slug}`, `/urun/${p.slug}`, "/urunler", "/sepet", "/giris", "/siparis-takip", "/sss", "/arama?q=test"];
  const problems: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const url of pages) {
      await page.goto(url);
      const { sw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth }));
      if (sw > w + 1) problems.push(`${w}px ${url}: yatay taşma (${sw}px)`);
      for (const [name, loc] of [["arama", page.getByRole("search").getByLabel("Ara")], ["sepet", page.getByTestId("cart-link")]] as const) {
        const box = await loc.boundingBox();
        if (!box || box.width < 1) problems.push(`${w}px ${url}: ${name} görünmüyor`);
        else if (box.x < 0 || box.x + box.width > w + 1) problems.push(`${w}px ${url}: ${name} ekran dışında`);
      }
      // dokunmatik hedef: başlıktaki sepet bağlantısı en az 32px yüksek
      const cart = await page.getByTestId("cart-link").boundingBox();
      if (cart && cart.height < 32) problems.push(`${w}px ${url}: sepet bağlantısı çok küçük (${cart.height}px)`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
