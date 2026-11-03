// ankarayapimarket.com/magaza kategori ağacından derlenen EK kategoriler ve markalar.
// Yalnız EKLER: var olan kategori, ürün ve markalara dokunmaz (upsert, update: {}). Tekrar çalıştırmak güvenlidir.
// Kullanım:  npx tsx prisma/kategori-ek.ts          (önizleme, veritabanına yazmaz)
//            npx tsx prisma/kategori-ek.ts --uygula (ekler)
//
// Kaynak ağaçtan ALINMAYANLAR (kategori değil): marka adları (Bosch, Dewalt, Makita, Stanley, Black Decker → Marka tablosuna),
// "Çok Satanlar", "Kampanyalı Ürünler" (kampanya/vitrin işi), "Tüm Ürünler", "Uncategorized", "Genel", "Diğer", "Yapı Market",
// kullanım amaçlı tekrar gruplar ("Ahşap İşleri", "Beton İşleri"), konu dışı olanlar ("Altın", "Orman", "Elektronik", "Beyaz Eşya").
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slug";

export const EK_KATEGORILER: { parent: string; profile: "STD" | "AGIR" | "HACIM"; children: string[] }[] = [
  {
    parent: "Elektrikli El Aletleri",
    profile: "STD",
    children: [
      "Şarjlı El Aletleri",
      "Metal İşleri",
      "Frezeler",
      "Tezgah Tipi Testereler",
      "Toz Toplama Sistemleri",
      "Sıcak Hava Tabancaları",
      "Boya Tabancası ve Karıştırıcılar",
      "Lazer Hizalama ve Ölçme",
      "Hobi Alet ve Aksesuarları",
      "Kaynak Makineleri",
      "Kompresör ve Aksesuarları",
    ],
  },
  { parent: "Bahçe ve Dış Mekan", profile: "STD", children: ["Çim Biçme Makineleri", "Bahçe Aydınlatma"] },
];

export const EK_MARKALAR = ["DeWalt", "Makita", "Stanley", "Black+Decker", "Askaynak"];

async function main() {
  const uygula = process.argv.includes("--uygula");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const profiles = Object.fromEntries((await prisma.shippingProfile.findMany()).map((p) => [p.code, p.id]));
    const once = await prisma.category.count();
    let yeniKat = 0, yeniMarka = 0;
    for (const grup of EK_KATEGORILER) {
      const pSlug = slugify(grup.parent);
      let parent = await prisma.category.findUnique({ where: { slug: pSlug } });
      if (!parent) {
        console.log(`+ ana kategori: ${grup.parent}`);
        yeniKat++;
        if (uygula) {
          const max = await prisma.category.aggregate({ where: { parentId: null }, _max: { sortOrder: true } });
          parent = await prisma.category.create({
            data: { name: grup.parent, slug: pSlug, sortOrder: (max._max.sortOrder ?? 0) + 1, defaultShippingProfileId: profiles[grup.profile] },
          });
        }
      }
      const startOrder = parent ? ((await prisma.category.aggregate({ where: { parentId: parent.id }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1 : 0;
      let i = 0;
      for (const child of grup.children) {
        const slug = `${pSlug}-${slugify(child)}`;
        if (await prisma.category.findUnique({ where: { slug } })) continue;
        console.log(`+ ${grup.parent} > ${child}`);
        yeniKat++;
        if (uygula && parent)
          await prisma.category.upsert({
            where: { slug },
            update: {},
            create: { name: child, slug, parentId: parent.id, sortOrder: startOrder + i++, defaultShippingProfileId: profiles[grup.profile] },
          });
      }
    }
    for (const name of EK_MARKALAR) {
      const slug = slugify(name);
      if ((await prisma.brand.findUnique({ where: { slug } })) || (await prisma.brand.findUnique({ where: { name } }))) continue;
      console.log(`+ marka: ${name}`);
      yeniMarka++;
      if (uygula) await prisma.brand.create({ data: { name, slug } });
    }
    console.log(
      uygula
        ? `Eklendi: ${yeniKat} kategori, ${yeniMarka} marka. Kategori sayısı ${once} -> ${await prisma.category.count()}`
        : `ÖNİZLEME: ${yeniKat} kategori, ${yeniMarka} marka eklenecek. Uygulamak için --uygula ekleyin.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes("kategori-ek")) main().catch((e) => { console.error(e); process.exit(1); });
