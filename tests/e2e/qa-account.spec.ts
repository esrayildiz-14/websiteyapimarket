// QA: üyelik formu doğrulamaları, Türkçe karakter ve XSS, profil düzenleme, şifre değiştirme, çıkış.
import { test, expect } from "@playwright/test";
import { uniq } from "./helpers";

test.describe.configure({ mode: "serial" });
const email = `${uniq("hesap").toLowerCase()}@test.local`;
const PASS = "Musteri-Sifre-2026";

test("üye olma: boş form, geçersiz e-posta/telefon, kısa şifre reddedilir; Türkçe karakterli ve HTML içeren ad güvenle kaydedilir", async ({ page }) => {
  await page.goto("/giris");
  const f = page.getByTestId("register-form");
  await f.getByRole("button", { name: "Üye ol" }).click();
  await expect(page.getByTestId("register-error")).toBeVisible();
  await f.locator('[name="firstName"]').fill("Çağrı <b>x</b>");
  await f.locator('[name="lastName"]').fill("Öztürk-Şahinoğlu");
  await f.locator('[name="email"]').fill("gecersiz@");
  await f.locator('[name="phone"]').fill("123");
  await f.locator('[name="password"]').fill("kisa");
  await f.locator('[name="kvkk"]').check();
  await f.getByRole("button", { name: "Üye ol" }).click();
  await expect(page.getByTestId("err-email")).toBeVisible();
  await expect(page.getByTestId("err-phone")).toBeVisible();
  await expect(page.getByTestId("err-password")).toBeVisible();
  await page.getByTestId("register-form").locator('[name="email"]').fill(email);
  await page.getByTestId("register-form").locator('[name="phone"]').fill("0532 111 22 33");
  await page.getByTestId("register-form").locator('[name="password"]').fill(PASS);
  await page.getByTestId("register-form").getByRole("button", { name: "Üye ol" }).click();
  await expect(page.getByTestId("account-link")).toContainText("Çağrı");
  await page.goto("/hesabim");
  await expect(page.getByTestId("customer-name")).toContainText("Çağrı <b>x</b> Öztürk-Şahinoğlu"); // metin olarak, HTML çalışmaz
  expect(await page.locator("b", { hasText: /^x$/ }).count()).toBe(0);
});

test("aynı e-posta ile ikinci üyelik engellenir", async ({ page }) => {
  await page.goto("/giris");
  const f = page.getByTestId("register-form");
  await f.locator('[name="firstName"]').fill("Ali");
  await f.locator('[name="lastName"]').fill("Veli");
  await f.locator('[name="email"]').fill(email.toUpperCase());
  await f.locator('[name="phone"]').fill("05321112233");
  await f.locator('[name="password"]').fill(PASS);
  await f.locator('[name="kvkk"]').check();
  await f.getByRole("button", { name: "Üye ol" }).click();
  await expect(page.getByTestId("register-error")).toContainText("kayıtlı");
});

async function signIn(page: import("@playwright/test").Page, pw = PASS) {
  await page.goto("/giris");
  const f = page.getByTestId("login-form");
  await f.locator('[name="email"]').fill(email);
  await f.locator('[name="password"]').fill(pw);
  await f.getByRole("button", { name: "Giriş yap" }).click();
}

test("profil düzenleme: geçersiz telefon reddedilir, geçerli bilgiler kaydedilir", async ({ page }) => {
  await signIn(page);
  await page.goto("/hesabim");
  const f = page.getByTestId("profile-form");
  await f.locator('[name="phone"]').fill("abc");
  await f.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("err-phone")).toBeVisible();
  await f.locator('[name="firstName"]').fill("Ayşe");
  await f.locator('[name="lastName"]').fill("Işık");
  await f.locator('[name="phone"]').fill("0533 222 33 44");
  await f.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("account-ok")).toContainText("güncellendi");
  await page.reload();
  await expect(page.getByTestId("customer-name")).toContainText("Ayşe Işık");
});

test("şifre değiştirme: yanlış mevcut şifre reddedilir; yeni şifreyle giriş, eskisiyle giriş yapılamaz; diğer oturum kapanır", async ({ page, browser }) => {
  await signIn(page);
  const other = await (await browser.newContext()).newPage();
  await signIn(other);
  await other.goto("/hesabim");
  await expect(other.getByTestId("customer-name")).toBeVisible();

  await page.goto("/hesabim");
  const f = page.getByTestId("password-form");
  await f.locator('[name="current"]').fill("yanlis-sifre-123");
  await f.locator('[name="password"]').fill("Yeni-Musteri-Sifre-2027");
  await f.locator('[name="confirm"]').fill("Yeni-Musteri-Sifre-2027");
  await f.getByRole("button", { name: "Şifreyi değiştir" }).click();
  await expect(page.getByTestId("err-current")).toBeVisible();
  await f.locator('[name="current"]').fill(PASS);
  await f.locator('[name="password"]').fill("Yeni-Musteri-Sifre-2027");
  await f.locator('[name="confirm"]').fill("Yeni-Musteri-Sifre-2027");
  await f.getByRole("button", { name: "Şifreyi değiştir" }).click();
  await expect(page.getByTestId("account-ok")).toContainText("değiştirildi");

  await other.goto("/hesabim");
  await expect(other).toHaveURL(/\/giris/); // diğer cihazdaki oturum kapandı
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await signIn(page, PASS);
  await expect(page.getByTestId("login-error")).toBeVisible();
  await signIn(page, "Yeni-Musteri-Sifre-2027");
  await expect(page.getByTestId("account-link")).toContainText("Hesabım");
});
