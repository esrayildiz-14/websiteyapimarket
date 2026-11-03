// Telefonunu kaybeden yöneticinin iki adımlı doğrulamasını kapatır ve oturumlarını sonlandırır.
// Yalnız sunucuya erişimi olan yetkili kişi çalıştırabilir:  node scripts/2fa-sifirla.mjs ornek@firma.com
import "dotenv/config";
import pg from "pg";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) { console.error("Kullanım: node scripts/2fa-sifirla.mjs <e-posta>"); process.exit(2); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN");
  const u = await c.query(`UPDATE users SET "totpSecret" = NULL, "totpPendingSecret" = NULL, "totpEnabledAt" = NULL, "totpLastStep" = NULL WHERE email = $1 AND type = 'STAFF' RETURNING id`, [email]);
  if (!u.rowCount) throw new Error("Bu e-postaya sahip yönetici bulunamadı.");
  await c.query(`DELETE FROM sessions WHERE "userId" = $1`, [u.rows[0].id]);
  await c.query(`INSERT INTO audit_logs (id, "userId", action, entity, "entityId", "createdAt") VALUES ('al_' || md5(random()::text), NULL, 'mfa.reset', 'User', $1, now())`, [u.rows[0].id]);
  await c.query("COMMIT");
  console.log("2FA_SIFIRLANDI " + email);
} catch (e) {
  await c.query("ROLLBACK");
  console.error("HATA", e.message);
  process.exit(1);
} finally {
  await c.end();
}
