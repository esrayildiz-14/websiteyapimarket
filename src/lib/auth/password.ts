import bcrypt from "bcryptjs";

const COST = 12;
// Kullanıcı bulunamadığında da aynı sürede yanıt vermek için sahte hash (zamanlama saldırısına karşı)
let DUMMY_HASH: string | null = null;
const dummy = () => (DUMMY_HASH ??= bcrypt.hashSync("kullanilmayan-sahte-sifre", COST));

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(plain, hash ?? dummy());
}

export function passwordProblems(plain: string): string | null {
  if (plain.length < 12) return "Şifre en az 12 karakter olmalı.";
  if (plain.length > 128) return "Şifre en fazla 128 karakter olabilir.";
  return null;
}
