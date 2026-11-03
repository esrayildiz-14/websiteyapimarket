import { prisma } from "@/lib/prisma";

// Adres formu için il → ilçe → mahalle listeleri. Herkese açık, yalnız okuma.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const il = Number(url.searchParams.get("il"));
  const ilce = Number(url.searchParams.get("ilce"));
  const headers = { "Cache-Control": "public, max-age=86400" };
  if (Number.isInteger(ilce) && ilce > 0) {
    const rows = await prisma.neighborhood.findMany({ where: { districtId: ilce }, orderBy: { name: "asc" }, select: { name: true, postalCode: true } });
    return Response.json(rows, { headers });
  }
  if (Number.isInteger(il) && il >= 1 && il <= 81) {
    const rows = await prisma.district.findMany({ where: { provinceId: il }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    return Response.json(rows, { headers });
  }
  const rows = await prisma.province.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return Response.json(rows, { headers });
}
