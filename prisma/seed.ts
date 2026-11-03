import { readFileSync } from "node:fs";
import { join } from "node:path";
// Başlangıç verisi. Tekrar çalıştırmak güvenlidir: var olan kayıtlar değiştirilmez.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS, ROLES } from "../src/lib/auth/permissions";
import { slugify } from "../src/lib/slug";
import { BRANDS, CARGO_COMPANIES, CATEGORY_TREE, PAGES, SHIPPING_PROFILES } from "./seed-data";
import { categorySeo, FAQ_DRAFTS, PAGE_DRAFTS } from "./content-drafts";
import { existsSync } from "node:fs";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  // Yetkiler ve roller
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
  const perms = await prisma.permission.findMany();
  for (const r of ROLES) {
    const role = await prisma.role.upsert({ where: { key: r.key }, update: { name: r.name }, create: { key: r.key, name: r.name } });
    const wanted = r.permissions === "ALL" ? perms : perms.filter((p) => (r.permissions as string[]).includes(p.key));
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }

  // İlk Super Admin
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD en az 12 karakter olmalı.");
    const superAdmin = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: await bcrypt.hash(password, 12), firstName: "Site", lastName: "Yöneticisi", type: "STAFF", roleId: superAdmin.id },
    });
    console.log(`✔ Super Admin: ${email}`);
  } else {
    console.warn("! SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD yok, admin oluşturulmadı.");
  }

  // Kargo profilleri
  for (const p of SHIPPING_PROFILES) {
    const { tiers, ...data } = p;
    const existing = await prisma.shippingProfile.findUnique({ where: { code: p.code } });
    if (existing) continue;
    await prisma.shippingProfile.create({
      data: { ...data, rates: { create: tiers.map((t) => ({ minWeight: t.min, maxWeight: t.max, price: t.price })) } },
    });
  }
  const profiles = Object.fromEntries((await prisma.shippingProfile.findMany()).map((p) => [p.code, p.id]));

  // Kategoriler
  let order = 0;
  for (const main of CATEGORY_TREE) {
    const slug = slugify(main.name);
    const parent = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name: main.name, slug, sortOrder: order++, defaultShippingProfileId: profiles[main.profile] },
    });
    let c = 0;
    for (const child of main.children) {
      const childSlug = `${slug}-${slugify(child)}`;
      await prisma.category.upsert({
        where: { slug: childSlug },
        update: {},
        create: { name: child, slug: childSlug, parentId: parent.id, sortOrder: c++, defaultShippingProfileId: profiles[main.profile] },
      });
    }
  }

  for (const name of BRANDS) await prisma.brand.upsert({ where: { slug: slugify(name) }, update: {}, create: { name, slug: slugify(name) } });
  for (const [i, rate] of [20, 10, 1, 0].entries())
    await prisma.taxRate.upsert({ where: { rate }, update: {}, create: { rate, name: rate === 0 ? "KDV'siz (%0)" : `%${rate}`, isDefault: i === 0 } });
  for (const [i, c] of CARGO_COMPANIES.entries())
    await prisma.cargoCompany.upsert({ where: { name: c.name }, update: {}, create: { ...c, sortOrder: i } });
  for (const p of PAGES)
    await prisma.page.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...p, content: p.type === "LEGAL" ? "Bu metin hazırlanıyor. Yayın öncesi hukukçu onayı gereklidir." : "İçerik admin panelinden eklenecek." },
    });
  await prisma.siteSetting.upsert({ where: { key: "shipping.freeThreshold" }, update: {}, create: { key: "shipping.freeThreshold", value: 2500 } });

  // Teslimat yöntemi: kargo firması anlaşması yapılmadığı için firmaya bağlı değil (ASM-02).
  await prisma.shippingMethod.upsert({
    where: { code: "STANDART" },
    update: {},
    create: { code: "STANDART", name: "Standart kargo", description: "Türkiye geneli adrese teslim. Kargo firması sipariş hazırlanırken atanır.", sortOrder: 0 },
  });

  await seedAddresses();
  await seedContent();

  const counts = await Promise.all([
    prisma.category.count(), prisma.brand.count(), prisma.shippingProfile.count(),
    prisma.province.count(), prisma.district.count(), prisma.neighborhood.count(),
  ]);
  console.log(`✔ Seed tamam: ${counts[0]} kategori, ${counts[1]} marka, ${counts[2]} kargo profili`);
  console.log(`✔ Adres sözlüğü: ${counts[3]} il, ${counts[4]} ilçe, ${counts[5]} mahalle`);
}

const PLACEHOLDERS = ["Bu metin hazırlanıyor. Yayın öncesi hukukçu onayı gereklidir.", "İçerik admin panelinden eklenecek."];

/** İçerik taslakları, SSS, kategori SEO alanları ve kategori görselleri. Yalnız boş / varsayılan alanları doldurur. */
async function seedContent() {
  for (const [slug, content] of Object.entries(PAGE_DRAFTS)) {
    const p = await prisma.page.findUnique({ where: { slug } });
    if (p && PLACEHOLDERS.includes(p.content)) await prisma.page.update({ where: { slug }, data: { content, isPublished: true, legalApproved: false } });
  }
  if ((await prisma.faq.count()) === 0)
    await prisma.faq.createMany({ data: FAQ_DRAFTS.map((f, i) => ({ question: f.q, answer: f.a, groupName: f.group, sortOrder: i })) });
  const cats = await prisma.category.findMany({ include: { children: { orderBy: { sortOrder: "asc" } }, parent: true } });
  for (const c of cats) {
    const data: { seoTitle?: string; seoDescription?: string; imageUrl?: string } = {};
    if (!c.seoTitle || !c.seoDescription) {
      const seo = categorySeo(c.name, c.children.map((x) => x.name), c.parent?.name);
      if (!c.seoTitle) data.seoTitle = seo.title;
      if (!c.seoDescription) data.seoDescription = seo.description;
    }
    if (!c.parentId && !c.imageUrl && existsSync(join(process.cwd(), "public", "kategori", `${c.slug}.svg`))) data.imageUrl = `/kategori/${c.slug}.svg`;
    if (Object.keys(data).length) await prisma.category.update({ where: { id: c.id }, data });
  }
}

type GeoFile = { code: number; name: string; districts: { name: string; n: [string, string][] }[] }[];

/** 81 il / ilçe / mahalle (posta kodu) — kaynak: prisma/data/KAYNAK.md. Tekrar çalıştırılırsa atlanır. */
async function seedAddresses() {
  if ((await prisma.province.count()) === 81 && (await prisma.neighborhood.count()) > 0) return;
  const geo = JSON.parse(readFileSync(join(process.cwd(), "prisma", "data", "tr-adres.json"), "utf8")) as GeoFile;
  await prisma.province.createMany({ data: geo.map((p) => ({ id: p.code, name: p.name })), skipDuplicates: true });
  await prisma.district.createMany({
    data: geo.flatMap((p) => p.districts.map((d) => ({ provinceId: p.code, name: d.name }))),
    skipDuplicates: true,
  });
  const districts = await prisma.district.findMany({ select: { id: true, provinceId: true, name: true } });
  const idOf = new Map(districts.map((d) => [`${d.provinceId}|${d.name}`, d.id]));
  const rows = geo.flatMap((p) =>
    p.districts.flatMap((d) => d.n.map(([name, postalCode]) => ({ districtId: idOf.get(`${p.code}|${d.name}`)!, name, postalCode }))),
  );
  for (let i = 0; i < rows.length; i += 5000) {
    await prisma.neighborhood.createMany({ data: rows.slice(i, i + 5000), skipDuplicates: true });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
