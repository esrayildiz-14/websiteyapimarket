"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { withMsg } from "@/components/admin/Flash";
import { deleteBanner, saveBanner, saveFaq, savePage } from "@/server/content-admin";

const done = (tab: string, r: { ok: boolean; message: string }) => {
  revalidatePath("/", "layout");
  redirect(withMsg(`/admin/icerik?sekme=${tab}`, r.ok ? "ok" : "hata", r.message));
};
export async function bannerAction(fd: FormData) {
  const u = await requireStaff("content.write");
  done("banner", fd.get("delete") === "on" ? await deleteBanner(u, String(fd.get("id"))) : await saveBanner(u, fd));
}
export async function pageAction(fd: FormData) {
  const u = await requireStaff("content.write");
  done("sayfa", await savePage(u, fd));
}
export async function faqAction(fd: FormData) {
  const u = await requireStaff("content.write");
  done("sss", await saveFaq(u, fd));
}
