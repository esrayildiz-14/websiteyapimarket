// Barkod (GTIN) kuralları: EAN-8, UPC-A (12), EAN-13, GTIN-14. Son hane kontrol hanesidir.

/** Boşluk, tire ve noktaları atar ("869 1234 567890" → "8691234567890"). */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/[\s.-]/g, "");
}

/** Kontrol hanesi dışındaki rakamlardan kontrol hanesini hesaplar (GS1 mod-10). */
export function checkDigit(body: string): number {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return (10 - (sum % 10)) % 10;
}

export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  return checkDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Kullanıcıya gösterilecek sorun (yoksa null). Kontrol hanesi yanlışsa doğru barkodu önerir. */
export function barcodeProblem(code: string): string | null {
  if (!/^\d+$/.test(code)) return "Barkod yalnız rakamlardan oluşmalı.";
  if (![8, 12, 13, 14].includes(code.length)) return `Barkod 8, 12, 13 veya 14 hane olmalı (girilen: ${code.length} hane).`;
  if (!isValidBarcode(code)) {
    const fixed = code.slice(0, -1) + checkDigit(code.slice(0, -1));
    return `Son hane (kontrol hanesi) tutmuyor. Ambalajdaki numarayı tekrar kontrol edin; ilk ${code.length - 1} hane doğruysa barkod ${fixed} olmalı.`;
  }
  return null;
}

/** 20–29 ile başlayan EAN-13'ler GS1'in mağaza içi kullanıma ayırdığı aralıktır (dünya genelinde tekil değildir). */
export function isInternalBarcode(code: string) {
  return code.length === 13 && code[0] === "2";
}

/** Mağaza içi EAN-13 üretir: "29" + 10 rakam + kontrol hanesi. */
export function makeInternalBarcode(random10: string) {
  const body = "29" + random10.padStart(10, "0").slice(-10);
  return body + checkDigit(body);
}
