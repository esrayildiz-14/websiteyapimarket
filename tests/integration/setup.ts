// Entegrasyon testleri gerçek bir PostgreSQL test veritabanında çalışır (migration ve seed uygulanmış olmalı).
// Yalnız adı _test veya _ci ile biten veritabanına bağlanır; gerçek veritabanına dokunmaz.
import "dotenv/config";

const url = process.env.INTEGRATION_DATABASE_URL || process.env.TEST_DATABASE_URL;
if (!url || !/\/[^/?]*_(test|ci)(\?|$)/.test(url)) throw new Error("Entegrasyon testleri için adı _test veya _ci ile biten bir veritabanı gerekir.");
process.env.DATABASE_URL = url;

export async function load() {
  const { prisma } = await import("@/lib/prisma");
  const inv = await import("@/server/inventory");
  return { prisma, ...inv };
}

let n = 0;
export function uniq(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${(n++).toString(36)}`.toUpperCase();
}
