// Yüklenen görselin türünü dosya içeriğinden (magic bytes) belirler; uzantıya veya tarayıcının söylediğine güvenmez.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 8;

export type ImageKind = { ext: "jpg" | "png" | "webp"; mime: string };

export function detectImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b))
    return { ext: "png", mime: "image/png" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { ext: "webp", mime: "image/webp" };
  return null;
}

export function validateImage(bytes: Uint8Array, name: string): { ok: true; kind: ImageKind } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: `${name}: dosya boş.` };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: `${name}: dosya 5 MB'tan büyük.` };
  const kind = detectImage(bytes);
  if (!kind) return { ok: false, error: `${name}: yalnız JPEG, PNG veya WebP görsel yüklenebilir.` };
  return { ok: true, kind };
}
