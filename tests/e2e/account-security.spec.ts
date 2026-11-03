// Faz 4 / P0: yönetici iki adımlı doğrulama (TOTP) ve müşteri şifre sıfırlama — gerçek sunucu ve test veritabanı.
import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { base32Decode, hotp } from "../../src/lib/totp";
import { q, uniq } from "./helpers";

const step = () => Math.floor(Date.now() / 30000);
const code = (secret: string, s: number) => hotp(base32Decode(secret.replace(/\s/g, "")), s);

async function adminLogin(page: Page, email: string, password: string) {
  await page.goto("/admin/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

test.describe("Yönetici iki adımlı doğrulama", () => {
  test.describe.configure({ mode: "serial" });
  const who = { email: `${uniq("ikiadim").toLowerCase()}@oneryapi.local`, password: "Iki-Adim-Sifre-2026" };
  let secret = "";

  test.beforeAll(async () => {
    const role = (await q<{ id: string }>(`SELECT id FROM roles WHERE key = 'ADMIN'`))[0].id;
    await q(
      `INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", type, "roleId", "isActive", "marketingConsent", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'İki', 'Adım', 'STAFF', $4, true, false, now(), now())`,
      [uniq("u2fa").toLowerCase(), who.email, await bcrypt.hash(who.password, 10), role],
    );
  });

  test("kurulum: yanlış kod reddedilir, doğru kodla etkinleşir", async ({ page }) => {
    await adminLogin(page, who.email, who.password);
    await expect(page.getByTestId("admin-user")).toBeVisible();
    await page.goto("/admin/guvenlik");
    await expect(page.getByTestId("mfa-status")).toContainText("Kapalı");
    await page.getByTestId("mfa-start").click();
    secret = (await page.getByTestId("mfa-secret").textContent())!;
    expect(secret.replace(/\s/g, "")).toMatch(/^[A-Z2-7]{32}$/);
    // anahtar veritabanında açık metin olarak tutulmaz
    const row = (await q<{ p: string }>(`SELECT "totpPendingSecret" AS p FROM users WHERE email = $1`, [who.email]))[0];
    expect(row.p).not.toContain(secret.replace(/\s/g, ""));
    expect(row.p.startsWith("v1.")).toBe(true);

    const f = page.getByTestId("mfa-confirm-form");
    await f.getByLabel("Doğrulama kodu").fill("000000");
    await f.getByRole("button", { name: "Doğrula ve etkinleştir" }).click();
    await expect(page.getByTestId("flash-err")).toContainText("doğrulanamadı");
    await page.getByTestId("mfa-confirm-form").getByLabel("Doğrulama kodu").fill(code(secret, step()));
    await page.getByTestId("mfa-confirm-form").getByRole("button", { name: "Doğrula ve etkinleştir" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("etkinleştirildi");
    await expect(page.getByTestId("mfa-status")).toContainText("Etkin");
  });

  test("girişte şifre tek başına yetmez; kod girilmeden panel açılmaz; doğru kodla girilir; aynı kod ikinci kez kabul edilmez", async ({ page, browser }) => {
    await adminLogin(page, who.email, who.password);
    await expect(page).toHaveURL(/\/admin\/giris\/dogrula/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/giris/);
    await expect(page.getByTestId("admin-user")).toHaveCount(0);

    await adminLogin(page, who.email, who.password);
    await page.getByLabel("Doğrulama kodu").fill("123456");
    await page.getByRole("button", { name: "Doğrula" }).click();
    await expect(page.getByTestId("mfa-error")).toBeVisible();
    const c = code(secret, step() + 1); // kurulumda kullanılan adımdan sonraki geçerli kod
    await page.getByLabel("Doğrulama kodu").fill(c);
    await page.getByRole("button", { name: "Doğrula" }).click();
    await expect(page.getByTestId("admin-user")).toBeVisible();
    expect(await q(`SELECT 1 FROM sessions s JOIN users u ON u.id = s."userId" WHERE u.email = $1 AND s."mfaPending"`, [who.email])).toHaveLength(0);

    // başka bir cihazdan aynı kodla giriş denemesi (kod tekrarı) reddedilir
    const other = await browser.newPage();
    await adminLogin(other, who.email, who.password);
    await other.getByLabel("Doğrulama kodu").fill(c);
    await other.getByRole("button", { name: "Doğrula" }).click();
    await expect(other.getByTestId("mfa-error")).toBeVisible();
    await other.close();
  });

  test("5 hatalı kodda bekleyen oturum kapanır, yeniden şifre gerekir", async ({ page }) => {
    await adminLogin(page, who.email, who.password);
    await expect(page).toHaveURL(/dogrula/);
    for (let i = 0; i < 4; i++) {
      await page.getByLabel("Doğrulama kodu").fill("000000");
      await page.getByRole("button", { name: "Doğrula" }).click();
      await expect(page.getByTestId("mfa-error")).toBeVisible();
    }
    await page.getByLabel("Doğrulama kodu").fill("000000");
    await page.getByRole("button", { name: "Doğrula" }).click();
    await expect(page).toHaveURL(/\/admin\/giris\?hata=/);
    await expect(page.getByTestId("flash-err")).toContainText("Çok fazla hatalı kod");
  });

  test("2FA kapatmak için şifre gerekir", async ({ page }) => {
    await q(`DELETE FROM login_attempts WHERE email = $1`, [who.email]);
    await adminLogin(page, who.email, who.password);
    await page.getByLabel("Doğrulama kodu").fill(code(secret, step() + 1));
    await page.getByRole("button", { name: "Doğrula" }).click();
    // aynı adım az önce kullanıldıysa bir sonraki pencereyi bekle
    if (await page.getByTestId("mfa-error").isVisible().catch(() => false)) {
      await page.waitForTimeout(31_000);
      await page.getByLabel("Doğrulama kodu").fill(code(secret, step() + 1));
      await page.getByRole("button", { name: "Doğrula" }).click();
    }
    await expect(page.getByTestId("admin-user")).toBeVisible();
    await page.goto("/admin/guvenlik");
    const f = page.getByTestId("mfa-disable-form");
    await f.locator('[name="password"]').fill("yanlis-sifre-123");
    await f.locator('[name="code"]').fill(code(secret, step()));
    await f.getByRole("button", { name: "İki adımlı doğrulamayı kapat" }).click();
    await expect(page.getByTestId("flash-err")).toContainText("Şifre hatalı");
    await expect(page.getByTestId("mfa-status")).toContainText("Etkin");
  });
});

test.describe("Müşteri şifre sıfırlama", () => {
  test.describe.configure({ mode: "serial" });
  const email = `${uniq("sifirla").toLowerCase()}@test.local`;
  let link = "";

  test.beforeAll(async () => {
    await q(
      `INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", type, "isActive", "marketingConsent", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'Ayşe', 'Kaya', 'CUSTOMER', true, false, now(), now())`,
      [uniq("cust").toLowerCase(), email, await bcrypt.hash("Eski-Musteri-Sifre-1", 10)],
    );
  });

  test("bağlantı istenir; kayıtlı olmayan e-postada da aynı yanıt verilir (hesap varlığı sızmaz)", async ({ page }) => {
    await page.goto("/giris");
    await page.getByTestId("forgot-link").click();
    await page.getByTestId("reset-request-form").getByLabel("E-posta").fill("olmayan-kisi@test.local");
    await page.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }).click();
    const unknownMsg = await page.getByTestId("reset-sent").textContent();
    await page.goto("/sifremi-unuttum");
    await page.getByTestId("reset-request-form").getByLabel("E-posta").fill(email.toUpperCase());
    await page.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }).click();
    expect(await page.getByTestId("reset-sent").textContent()).toBe(unknownMsg);
    expect(await q(`SELECT 1 FROM email_logs WHERE "toEmail" = 'olmayan-kisi@test.local'`)).toHaveLength(0);
    const body = (await q<{ body: string }>(`SELECT body FROM email_logs WHERE "toEmail" = $1 AND template = 'password.reset' ORDER BY "createdAt" DESC LIMIT 1`, [email]))[0].body;
    link = /\/sifre-yenile\?t=[A-Za-z0-9_-]+/.exec(body)![0];
    const stored = await q<{ tokenHash: string }>(`SELECT t."tokenHash" FROM password_reset_tokens t JOIN users u ON u.id = t."userId" WHERE u.email = $1`, [email]);
    expect(stored).toHaveLength(1);
    expect(link).not.toContain(stored[0].tokenHash); // yalnız özet saklanır
  });

  test("kısa veya eşleşmeyen şifre reddedilir; geçerli şifre kaydedilir, eski şifre çalışmaz, bağlantı ikinci kez kullanılamaz", async ({ page }) => {
    await page.goto(link);
    const f = page.getByTestId("reset-form");
    await f.locator('[name="password"]').evaluate((el: HTMLInputElement) => el.removeAttribute("minlength"));
    await f.locator('[name="password"]').fill("kisa");
    await f.locator('[name="confirm"]').fill("kisa");
    await f.getByRole("button", { name: "Şifreyi kaydet" }).click();
    await expect(page.getByTestId("reset-error")).toContainText("en az 12");
    await page.getByTestId("reset-form").locator('[name="password"]').fill("Yeni-Musteri-Sifre-2026");
    await page.getByTestId("reset-form").locator('[name="confirm"]').fill("Baska-Bir-Sifre-2026");
    await page.getByTestId("reset-form").getByRole("button", { name: "Şifreyi kaydet" }).click();
    await expect(page.getByTestId("reset-error")).toContainText("eşleşmiyor");
    await page.getByTestId("reset-form").locator('[name="password"]').fill("Yeni-Musteri-Sifre-2026");
    await page.getByTestId("reset-form").locator('[name="confirm"]').fill("Yeni-Musteri-Sifre-2026");
    await page.getByTestId("reset-form").getByRole("button", { name: "Şifreyi kaydet" }).click();
    await expect(page.getByTestId("flash-ok")).toContainText("Şifreniz yenilendi");

    const login = page.getByTestId("login-form");
    await login.locator('[name="email"]').fill(email);
    await login.locator('[name="password"]').fill("Eski-Musteri-Sifre-1");
    await login.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByTestId("login-error")).toBeVisible();
    await page.getByTestId("login-form").locator('[name="password"]').fill("Yeni-Musteri-Sifre-2026");
    await page.getByTestId("login-form").getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByTestId("account-link")).toContainText("Hesabım");

    await page.goto(link);
    await expect(page.getByTestId("reset-invalid")).toBeVisible();
  });

  test("saatte en fazla 3 bağlantı üretilir; yönetici hesabı için bağlantı üretilmez", async ({ page }) => {
    for (let i = 0; i < 4; i++) {
      await page.goto("/sifremi-unuttum");
      await page.getByTestId("reset-request-form").getByLabel("E-posta").fill(email);
      await page.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }).click();
      await expect(page.getByTestId("reset-sent")).toBeVisible();
    }
    const n = (await q<{ n: number }>(`SELECT count(*)::int n FROM password_reset_tokens t JOIN users u ON u.id = t."userId" WHERE u.email = $1`, [email]))[0].n;
    expect(n).toBe(3);
    await page.goto("/sifremi-unuttum");
    await page.getByTestId("reset-request-form").getByLabel("E-posta").fill("test-admin@oneryapi.local");
    await page.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }).click();
    await expect(page.getByTestId("reset-sent")).toBeVisible();
    expect(await q(`SELECT 1 FROM email_logs WHERE "toEmail" = 'test-admin@oneryapi.local' AND template = 'password.reset'`)).toHaveLength(0);
  });
});
