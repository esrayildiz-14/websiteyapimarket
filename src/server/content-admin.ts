import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { StaffUser } from "@/lib/auth/session";
import { deleteStoredFile, fileFrom, saveImage, UploadError } from "@/lib/storage";

export type Result = { ok: true; message: string } | { ok: false; message: string };
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
const date = (v: string) => (v ? new Date(v) : null);

/** Ana sayfa bannerı. Bağlantı yalnız site içi yol (/...) veya https:// olabilir. */
export async function saveBanner(user: StaffUser, fd: FormData): Promise<Result> {
  const id = str(fd, "id", 40) || null;
  const title = str(fd, "title", 120);
  const linkUrl = str(fd, "linkUrl", 300);
  if (title.length < 3) return { ok: false, message: "Banner başlığı girin." };
  if (linkUrl && !(linkUrl.startsWith("/") && !linkUrl.startsWith("//")) && !linkUrl.startsWith("https://")) return { ok: false, message: "Bağlantı / ile başlayan site içi adres veya https:// adresi olmalı." };
  const startsAt = date(str(fd, "startsAt", 30));
  const endsAt = date(str(fd, "endsAt", 30));
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, message: "Bitiş başlangıçtan sonra olmalı." };
  const before = id ? await prisma.banner.findUnique({ where: { id } }) : null;
  let img: { url: string; storageKey: string } | null = null;
  const file = fileFrom(fd, "image");
  if (file) {
    try {
      img = await saveImage(file, "banners");
    } catch (e) {
      if (e instanceof UploadError) return { ok: false, message: e.message };
      throw e;
    }
  }
  const data = {
    title, subtitle: str(fd, "subtitle", 200) || null, linkUrl: linkUrl || null, buttonText: str(fd, "buttonText", 40) || null,
    sortOrder: Number(fd.get("sortOrder")) || 0, startsAt, endsAt, isActive: fd.get("isActive") === "on",
    ...(img ? { imageUrl: img.url, storageKey: img.storageKey } : {}),
  };
  const saved = id ? await prisma.banner.update({ where: { id }, data }) : await prisma.banner.create({ data });
  if (img && before?.storageKey) await deleteStoredFile(before.storageKey);
  await audit(user.id, id ? "banner.update" : "banner.create", "Banner", saved.id, undefined, { title, isActive: data.isActive });
  return { ok: true, message: `"${title}" bannerı kaydedildi.` };
}

export async function deleteBanner(user: StaffUser, id: string): Promise<Result> {
  const b = await prisma.banner.findUnique({ where: { id } });
  if (!b) return { ok: false, message: "Banner bulunamadı." };
  await prisma.banner.delete({ where: { id } });
  await deleteStoredFile(b.storageKey);
  await audit(user.id, "banner.delete", "Banner", id, { title: b.title }, undefined);
  return { ok: true, message: "Banner silindi." };
}

/**
 * Kurumsal ve hukuki sayfalar. Hukuki metinde "uzman onayı" işareti yalnız açıkça işaretlenirse verilir;
 * içerik değiştiğinde onay kendiliğinden kalkar (yeniden kontrol gerekir).
 */
export async function savePage(user: StaffUser, fd: FormData): Promise<Result> {
  const id = str(fd, "id", 40);
  const p = await prisma.page.findUnique({ where: { id } });
  if (!p) return { ok: false, message: "Sayfa bulunamadı." };
  const title = str(fd, "title", 120);
  const content = String(fd.get("content") ?? "").replace(/\r\n?/g, "\n").slice(0, 60000); // tarayıcı textarea satır sonlarını \r\n gönderir
  if (title.length < 2 || content.trim().length < 10) return { ok: false, message: "Başlık ve içerik girin." };
  const changed = content !== p.content;
  const approved = p.type === "LEGAL" ? fd.get("legalApproved") === "on" && (!changed || fd.get("approveChange") === "on") : false;
  await prisma.page.update({ where: { id }, data: { title, content, isPublished: fd.get("isPublished") === "on", legalApproved: approved } });
  await audit(user.id, "page.update", "Page", id, { legalApproved: p.legalApproved }, { legalApproved: approved, changed });
  return { ok: true, message: `"${title}" kaydedildi.` + (p.type === "LEGAL" && !approved ? " Hukuki uzman onayı işaretli değil; sayfada taslak uyarısı gösterilir." : "") };
}

export async function saveFaq(user: StaffUser, fd: FormData): Promise<Result> {
  const id = str(fd, "id", 40) || null;
  if (fd.get("delete") === "on" && id) {
    await prisma.faq.delete({ where: { id } });
    await audit(user.id, "faq.delete", "Faq", id, undefined, undefined);
    return { ok: true, message: "Soru silindi." };
  }
  const question = str(fd, "question", 300);
  const answer = str(fd, "answer", 3000);
  if (question.length < 5 || answer.length < 5) return { ok: false, message: "Soru ve cevap girin." };
  const data = { question, answer, groupName: str(fd, "groupName", 60) || null, sortOrder: Number(fd.get("sortOrder")) || 0, isActive: fd.get("isActive") === "on" };
  const saved = id ? await prisma.faq.update({ where: { id }, data }) : await prisma.faq.create({ data });
  await audit(user.id, id ? "faq.update" : "faq.create", "Faq", saved.id, undefined, { question });
  return { ok: true, message: "Soru kaydedildi." };
}
