// QA: sitedeki tüm bağlantıların taranması — kırık bağlantı, sunucu hatası, konsol hatası, temel SEO ve erişilebilirlik.
import { test, expect, type Page } from "@playwright/test";
import { insertProduct, login, q } from "./helpers";

type Issue = string;

async function audit(page: Page, url: string, opts: { seo: boolean }): Promise<Issue[]> {
  const issues: Issue[] = [];
  const r = await page.evaluate(({ seo }) => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    if (document.documentElement.lang !== "tr") out.push(`html lang="${document.documentElement.lang}"`);
    if (!document.title.trim()) out.push("başlık (title) boş");
    const h1 = document.querySelectorAll("h1").length;
    if (h1 !== 1) out.push(`${h1} adet h1 (1 olmalı)`);
    for (const img of Array.from(document.images)) if (!img.hasAttribute("alt")) out.push(`alt metni olmayan görsel: ${img.src.slice(-60)}`);
    for (const el of Array.from(document.querySelectorAll("input, select, textarea"))) {
      const i = el as HTMLInputElement;
      if (["hidden", "submit", "button"].includes(i.type) || !visible(i)) continue;
      const named = i.labels?.length || i.getAttribute("aria-label") || i.getAttribute("aria-labelledby") || i.title;
      if (!named) out.push(`etiketsiz form alanı: ${i.tagName.toLowerCase()}[name=${i.name}]`);
    }
    for (const b of Array.from(document.querySelectorAll("button, a[href]"))) {
      if (!visible(b)) continue;
      const name = (b.textContent ?? "").trim() || b.getAttribute("aria-label") || b.getAttribute("title") || b.querySelector("img[alt]")?.getAttribute("alt");
      if (!name) out.push(`adı olmayan ${b.tagName.toLowerCase()}`);
    }
    if (seo) {
      if (!document.querySelector('meta[name="description"]')?.getAttribute("content")) out.push("meta description yok");
      if (!document.querySelector('link[rel="canonical"]')) out.push("canonical yok");
    }
    if (document.body.innerText.includes("Application error")) out.push("Next.js uygulama hatası ekranı");
    return out;
  }, opts);
  issues.push(...r.map((x) => `${url}: ${x}`));
  return issues;
}

function collectErrors(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errs.push(`console ${m.text().slice(0, 200)}`);
  });
  return errs;
}

async function crawl(page: Page, start: string[], allow: (u: string) => boolean, max: number, seoFor: (u: string) => boolean) {
  const errs = collectErrors(page);
  const seen = new Set<string>();
  const queue = [...start];
  const issues: string[] = [];
  const statuses: Record<string, number> = {};
  while (queue.length && seen.size < max) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const before = errs.length;
    const res = await page.goto(url);
    const st = res?.status() ?? 0;
    statuses[url] = st;
    if (st >= 400) { issues.push(`${url}: HTTP ${st}`); continue; }
    issues.push(...(await audit(page, url, { seo: seoFor(url) })));
    if (errs.length > before) issues.push(...errs.slice(before).map((e) => `${url}: ${e}`));
    const links = await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const raw of links) {
      if (!raw.startsWith("/") || raw.startsWith("//")) continue;
      const u = raw.split("#")[0];
      if (u && allow(u) && !seen.has(u)) queue.push(u);
    }
  }
  return { issues, statuses, count: seen.size };
}

test("müşteri tarafı: bütün bağlantılar çalışır, hata/konsol hatası yok, SEO ve erişilebilirlik temel kontrolleri", async ({ page }) => {
  test.setTimeout(600_000);
  const cat = (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0];
  const p = await insertProduct({ categoryId: cat.id, stock: 3 });
  await q(`UPDATE products SET "shortDescription" = 'Kısa açıklama' WHERE id = $1`, [p.id]);
  const indexable = (u: string) => /^\/(urun|kategori)\//.test(u) || u === "/" || u === "/urunler";
  const r = await crawl(page, ["/", `/urun/${p.slug}`, "/urunler", "/sepet", "/giris", "/siparis-takip", "/sss", "/sifremi-unuttum"],
    (u) => !/^\/(admin|api|uploads|odeme)/.test(u) && !u.includes("sayfa=") && !u.includes("sirala="), 70, indexable);
  console.log(`taranan sayfa: ${r.count}`);
  expect(r.count).toBeGreaterThan(15);
  expect(r.issues, r.issues.join("\n")).toEqual([]);
});

test("yönetim paneli: bütün menü sayfaları açılır, sunucu/konsol hatası yok, erişilebilirlik temel kontrolleri", async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  const r = await crawl(page, ["/admin"], (u) => u.startsWith("/admin") && !/rapor-indir|sablon-urun|giris/.test(u), 90, () => false);
  console.log(`taranan admin sayfası: ${r.count}`);
  expect(r.count).toBeGreaterThan(25);
  expect(r.issues, r.issues.join("\n")).toEqual([]);
});

test("bulunmayan adres özel 404 sayfası verir; bulunmayan ürün ve kategori 404", async ({ page }) => {
  for (const u of ["/olmayan-sayfa-xyz", "/urun/olmayan-urun-xyz", "/kategori/olmayan-kategori-xyz", "/sayfa/olmayan"]) {
    const res = await page.goto(u);
    expect(res?.status(), u).toBe(404);
    await expect(page.getByTestId("not-found"), u).toBeVisible();
  }
});

test("ürün sayfası yapılandırılmış veri: Product + BreadcrumbList, Open Graph etiketleri", async ({ page }) => {
  const cat = (await q<{ id: string }>(`SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" LIMIT 1`))[0];
  const p = await insertProduct({ categoryId: cat.id, stock: 3 });
  await page.goto(`/urun/${p.slug}`);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = ld.map((t) => JSON.parse(t)["@type"]);
  expect(types).toContain("Product");
  expect(types).toContain("BreadcrumbList");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Test ürünü/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "tr_TR");
});
