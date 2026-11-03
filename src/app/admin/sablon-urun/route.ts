import { can, getCurrentStaff } from "@/lib/auth/session";
import { buildTemplate } from "@/server/product-import";

/** Toplu ürün içe aktarma şablonu (.xlsx). Yalnız ürün yazma yetkisi olan personel indirebilir. */
export async function GET() {
  const user = await getCurrentStaff();
  if (!user || !can(user, "product.write")) return new Response("Yetkisiz", { status: 403 });
  const buf = await buildTemplate();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="oner-yapi-urun-sablonu.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
