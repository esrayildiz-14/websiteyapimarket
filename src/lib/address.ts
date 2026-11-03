// Türkiye adres doğrulama kuralları (saf fonksiyonlar; sunucuda ve testlerde kullanılır).

/** Posta kodu 5 hane ve ilk iki hanesi il plaka koduna eşit olmalı (ör. İstanbul 34xxx). */
export function postalCodeProblem(postalCode: string, provinceId: number): string | null {
  if (!/^\d{5}$/.test(postalCode)) return "Posta kodu 5 haneli olmalı.";
  if (Number(postalCode.slice(0, 2)) !== provinceId) return "Posta kodu seçilen ile ait değil (ilk iki hane il plaka kodu olmalı).";
  return null;
}

/** 05xx xxx xx xx / +90 5xx … biçimlerini 05xxxxxxxxx olarak normalleştirir; geçersizse null. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[\s()-]/g, "");
  const m = /^(?:\+90|0090|90|0)?(5\d{9})$/.exec(d);
  return m ? "0" + m[1] : null;
}
