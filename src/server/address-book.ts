import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone, postalCodeProblem } from "@/lib/address";

export const addressSchema = z.object({
  title: z.string().trim().min(1, "Adres başlığı girin (ör. Ev).").max(40),
  fullName: z.string().trim().min(3, "Ad soyad girin.").max(100),
  phone: z.string().trim().min(10, "Telefon girin.").max(20),
  provinceId: z.coerce.number().int().min(1, "İl seçin.").max(81, "İl seçin."),
  districtId: z.coerce.number({ invalid_type_error: "İlçe seçin." }).int().min(1, "İlçe seçin."),
  neighborhood: z.string().trim().min(2, "Mahalle girin.").max(120),
  postalCode: z.string().trim(),
  line: z.string().trim().min(10, "Açık adresi (cadde, sokak, bina ve daire no) girin.").max(300),
});
export type AddressInput = z.infer<typeof addressSchema>;

/** Adresi doğrular: il–ilçe ilişkisi veritabanından, posta kodu ve telefon kurallarla. */
export async function validateAddress(raw: Record<string, unknown>) {
  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false as const, errors };
  }
  const a = parsed.data;
  const errors: Record<string, string> = {};
  const district = await prisma.district.findUnique({ where: { id: a.districtId }, include: { province: true } });
  if (!district || district.provinceId !== a.provinceId) errors.districtId = "İlçe seçilen ile ait değil.";
  const pc = postalCodeProblem(a.postalCode, a.provinceId);
  if (pc) errors.postalCode = pc;
  const phone = normalizePhone(a.phone);
  if (!phone) errors.phone = "Geçerli bir cep telefonu girin (05xx xxx xx xx).";
  if (Object.keys(errors).length) return { ok: false as const, errors };
  return {
    ok: true as const,
    value: { ...a, phone: phone! },
    snapshot: {
      fullName: a.fullName, phone: phone!, province: district!.province.name, provinceId: a.provinceId,
      district: district!.name, districtId: a.districtId, neighborhood: a.neighborhood, postalCode: a.postalCode, line: a.line,
    },
  };
}
export type AddressSnapshot = {
  fullName: string; phone: string; province: string; provinceId: number; district: string; districtId: number;
  neighborhood: string; postalCode: string; line: string;
};
