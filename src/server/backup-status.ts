import "server-only";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type BackupStatus =
  | { state: "none" }
  | { state: "failed"; at: Date; error: string }
  | { state: "stale"; at: Date }
  | { state: "ok"; at: Date };

/** Yedek betiğinin yazdığı son durum (yedekler/son-durum.json). 26 saatten eski başarılı yedek "eski" sayılır. */
export async function backupStatus(now = new Date()): Promise<BackupStatus> {
  try {
    const raw = JSON.parse(await readFile(join(resolve(process.env.YEDEK_DIR || "yedekler"), "son-durum.json"), "utf8"));
    const at = new Date(raw.zaman);
    if (!raw.ok) return { state: "failed", at, error: String(raw.hata ?? "bilinmeyen hata").slice(0, 200) };
    if (now.getTime() - at.getTime() > 26 * 3600_000) return { state: "stale", at };
    return { state: "ok", at };
  } catch {
    return { state: "none" };
  }
}
