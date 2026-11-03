// Test veritabanını sıfırlar, migration ve seed'i çalıştırır, test kullanıcılarını ekler.
// Yalnız adında "_test" geçen veritabanında çalışır; gerçek veritabanına dokunmaz.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { ADMIN, STAFF } from "./helpers";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/\/[^/?]*_test(\?|$)/.test(url)) throw new Error("TEST_DATABASE_URL adı '_test' ile biten ayrı bir veritabanı olmalı.");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();

  const env = {
    ...process.env,
    DATABASE_URL: url,
    SEED_ADMIN_EMAIL: ADMIN.email,
    SEED_ADMIN_PASSWORD: ADMIN.password,
  };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx prisma db seed", { env, stdio: "inherit" });

  // Sipariş personeli rolünde ikinci test kullanıcısı (yetki testleri için)
  const c2 = new pg.Client({ connectionString: url });
  await c2.connect();
  const role = await c2.query(`SELECT id FROM roles WHERE key = 'ORDER_STAFF'`);
  await c2.query(
    `INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", type, "roleId", "isActive", "marketingConsent", "createdAt", "updatedAt")
     VALUES ('test-order-staff', $1, $2, 'Sipariş', 'Personeli', 'STAFF', $3, true, false, now(), now())`,
    [STAFF.email, await bcrypt.hash(STAFF.password, 10), role.rows[0].id],
  );
  await c2.end();

  rmSync("storage/test-uploads", { recursive: true, force: true });
}
