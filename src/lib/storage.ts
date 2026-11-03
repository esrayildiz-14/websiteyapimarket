import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateImage } from "./image";

// Görseller şimdilik sunucu diskinde (UPLOAD_DIR) tutulur ve /uploads/... rotasıyla sunulur.
// S3 / Cloudinary'ye geçerken yalnız bu dosya değişir.

function root() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || "storage/uploads");
}

export type UploadFolder = "products" | "banners" | "categories" | "brands";

export async function saveImage(file: File, folder: UploadFolder) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateImage(bytes, file.name || "görsel");
  if (!check.ok) throw new UploadError(check.error);
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomBytes(12).toString("hex")}.${check.kind.ext}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return { storageKey: key, url: `/uploads/${key}` };
}

export async function deleteStoredFile(storageKey: string | null | undefined) {
  if (!storageKey) return;
  const full = safePath(storageKey);
  if (!full) return;
  await unlink(full).catch(() => undefined);
}

export async function readStoredFile(storageKey: string) {
  const full = safePath(storageKey);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

/** Yol geçişini (../) engeller: anahtar her zaman yükleme klasörünün içinde kalmalı */
function safePath(storageKey: string) {
  if (!/^[a-z]+\/\d{4}-\d{2}\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(storageKey)) return null;
  const full = path.resolve(root(), storageKey);
  return full.startsWith(root() + path.sep) ? full : null;
}

export class UploadError extends Error {}

/** "/uploads/<anahtar>" → "<anahtar>" (yalnız bu sistemin ürettiği adresler) */
export function keyFromUrl(url: string | null | undefined) {
  return url && url.startsWith("/uploads/") ? url.slice("/uploads/".length) : null;
}

/** Formdan gelen tek görsel alanı: boşsa null */
export function fileFrom(fd: FormData, name: string): File | null {
  const f = fd.get(name);
  return typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0 ? (f as File) : null;
}
