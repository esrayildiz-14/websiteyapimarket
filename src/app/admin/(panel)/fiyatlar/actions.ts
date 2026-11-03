"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { parseMoney } from "@/lib/money";
import { bulkPriceSchema, bulkUpdatePrices, updatePrice } from "@/server/price-stock-admin";

function back(fd: FormData) {
  const b = String(fd.get("back") || "/admin/fiyatlar");
  return b.startsWith("/admin/fiyatlar") ? b : "/admin/fiyatlar";
}

export async function updatePriceAction(fd: FormData) {
  const user = await requireStaff("price.write");
  const r = await updatePrice(user, String(fd.get("id")), String(fd.get("price") ?? ""), String(fd.get("salePrice") ?? ""));
  revalidatePath("/", "layout");
  redirect(withMsg(back(fd), r.ok ? "ok" : "hata", r.message));
}

export async function bulkPriceAction(fd: FormData) {
  const user = await requireStaff("price.write");
  const scope = String(fd.get("scope"));
  const parsed = bulkPriceSchema.safeParse({
    scope,
    scopeId: scope === "category" ? String(fd.get("categoryId") || "") : scope === "brand" ? String(fd.get("brandId") || "") : undefined,
    field: fd.get("field"),
    op: fd.get("op"),
    amount: fd.get("op") === "clear_sale" ? 0 : parseMoney(String(fd.get("amount") ?? "")) ?? -1,
    rounding: fd.get("rounding") || "none",
  });
  if (!parsed.success) redirect(withMsg("/admin/fiyatlar", "hata", "Toplu güncelleme bilgileri eksik veya hatalı (oran/tutar girin)."));
  const input = parsed.data;
  if ((input.scope === "category" || input.scope === "brand") && !input.scopeId) redirect(withMsg("/admin/fiyatlar", "hata", "Kategori veya marka seçin."));
  const apply = fd.get("confirm") === "on";
  const r = await bulkUpdatePrices(user, input, !apply);
  if (apply) revalidatePath("/", "layout");
  redirect(
    withMsg(
      "/admin/fiyatlar",
      apply ? "ok" : "uyari",
      apply
        ? `${r.changes.length} ürünün fiyatı güncellendi (${r.matched} ürün tarandı).`
        : `Önizleme: ${r.matched} ürünün ${r.changes.length} tanesi değişecek. Uygulamak için "Onaylıyorum" kutusunu işaretleyip tekrar gönderin.` +
            (r.changes[0] ? ` Örnek: ${r.changes[0].name} ${r.changes[0].cur.price} → ${r.changes[0].next.price}.` : ""),
    ),
  );
}
