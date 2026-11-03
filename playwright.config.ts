import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

const PORT = 3100;
const TEST_DB = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 180_000,
  expect: { timeout: 60_000 }, // geliştirme sunucusu her sayfayı ilk açılışta derler (20+ sn)
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Bilgisayarda kurulu Google Chrome kullanılır; ayrıca tarayıcı indirilmez.
    channel: process.env.PW_CHANNEL || "chrome",
    headless: true,
    locale: "tr-TR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "masaustu", testIgnore: /responsive\.spec/ },
    { name: "masaustu-duzen", testMatch: /responsive\.spec/, use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", testMatch: /responsive\.spec/, use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "mobil", testMatch: /responsive\.spec/, use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL || "chrome" } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/giris`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      DATABASE_URL: TEST_DB,
      NEXT_DIST_DIR: ".next-test",
      UPLOAD_DIR: "storage/test-uploads",
      TRUST_PROXY_HOPS: "1", // testler X-Forwarded-For ile farklı istemci IP'lerini taklit edebilsin
      RATE_LIMIT_ADRES: "60",
      YEDEK_DIR: "storage/test-yedek",
      EMAIL_LOG_SECRETS: "1", // testler şifre sıfırlama bağlantısını e-posta kaydından okur
      APP_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=", // yalnız test // yedek uyarısı testleri bu klasöre durum dosyası yazar
      PAYMENT_TEST_PROVIDER: "1", // yalnız _test veritabanında etkinleşen sahte ödeme sağlayıcısı
      IYZICO_API_KEY: "",
      IYZICO_SECRET_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
