import { z } from "zod";

const text = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : v), z.string().max(max).optional());

const slug = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim().toLowerCase()) : v),
  z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Adres (slug) yalnız küçük harf, rakam ve tire içerebilir.").max(120).optional(),
);

const sortOrder = z.preprocess((v) => (v === "" || v === undefined || v === null ? 0 : Number(v)), z.number().int().min(0).max(9999));

export const categoryInputSchema = z.object({
  name: z.string({ required_error: "Kategori adı girin." }).trim().min(2, "Kategori adı en az 2 karakter olmalı.").max(80),
  parentId: text(40),
  slug,
  description: text(2000),
  seoTitle: text(70),
  seoDescription: text(170),
  defaultShippingProfileId: text(40),
  sortOrder,
  isActive: z.boolean(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const brandInputSchema = z.object({
  name: z.string({ required_error: "Marka adı girin." }).trim().min(2, "Marka adı en az 2 karakter olmalı.").max(60),
  slug,
  description: text(1000),
  sortOrder,
  isActive: z.boolean(),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

export function formObject(fd: FormData, keys: string[], checkboxes: string[] = []) {
  const o: Record<string, unknown> = {};
  for (const k of keys) {
    const v = fd.get(k);
    o[k] = typeof v === "string" ? v : undefined;
  }
  for (const k of checkboxes) o[k] = fd.get(k) === "on" || fd.get(k) === "true";
  return o;
}

export function zodErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "_");
    out[k] ??= i.message;
  }
  return out;
}
