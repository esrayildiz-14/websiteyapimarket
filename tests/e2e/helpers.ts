import { expect, type Page } from "@playwright/test";
import pg from "pg";
import "dotenv/config";

export const ADMIN = { email: "test-admin@oneryapi.local", password: "Test-Admin-Sifre-2026" };
export const STAFF = { email: "test-siparis@oneryapi.local", password: "Test-Siparis-Sifre-2026" };

let pool: pg.Pool | null = null;
export function db() {
  pool ??= new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
  return pool;
}
export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(sql, params)).rows as T[];
}

export async function login(page: Page, who = ADMIN) {
  await page.goto("/admin/giris");
  if (!page.url().includes("/admin/giris")) return; // bu tarayıcı bağlamında zaten açık bir yönetici oturumu var
  await page.getByLabel("E-posta").fill(who.email);
  await page.getByLabel("Şifre").fill(who.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByTestId("admin-user")).toBeVisible();
}

/** 2×2 piksel geçerli PNG */
export function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
    "base64",
  );
}

export function uniq(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/** Test için doğrudan veritabanına aktif ürün ekler (form testinden bağımsız senaryolar için). */
export async function insertProduct(opts: { categoryId: string; brandId?: string | null; stock?: number; price?: number; name?: string; profile?: string }) {
  const sku = uniq("DBT").replace(/[^A-Z0-9-]/g, "");
  const id = "t" + sku.toLowerCase().replace(/-/g, "");
  const slug = id;
  const prof = (await q<{ id: string }>(`SELECT id FROM shipping_profiles WHERE code = $1`, [opts.profile ?? "STD"]))[0].id;
  await q(
    `INSERT INTO products (id, name, slug, sku, "categoryId", "brandId", price, "vatRate", "saleUnit", "weightKg", "widthCm", "heightCm", "lengthCm",
       "shippingProfileId", status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, 20, 'ADET', 1.5, 20, 10, 30, $8, 'ACTIVE', now(), now())`,
    [id, opts.name ?? `Test ürünü ${sku}`, slug, sku, opts.categoryId, opts.brandId ?? null, opts.price ?? 100, prof],
  );
  await q(`INSERT INTO inventory (id, "productId", quantity, reserved, "minStock", "updatedAt") VALUES ($1, $2, $3, 0, 0, now())`, [
    "inv" + id, id, opts.stock ?? 10,
  ]);
  return { id, slug, sku };
}
