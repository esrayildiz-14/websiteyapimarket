"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { importProducts, type RowResult } from "@/server/product-import";

export type ImportState = { message?: string; results?: RowResult[]; applied?: boolean };

export async function importAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireStaff("product.write");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Bir .xlsx dosyası seçin." };
  const apply = fd.get("mode") === "apply";
  const r = await importProducts(user, file, apply);
  if (!r.ok) return { message: r.message };
  if (apply) revalidatePath("/", "layout");
  return { results: r.results, applied: apply };
}
