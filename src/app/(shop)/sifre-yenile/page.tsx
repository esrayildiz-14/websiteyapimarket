import Link from "next/link";
import { NewPasswordForm } from "@/components/shop/ResetForms";
import { resetTokenUsable } from "@/server/password-reset";

export const metadata = { title: "Şifre yenile", robots: { index: false } };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPage({ searchParams }: { searchParams: SP }) {
  const t = (await searchParams).t;
  const token = typeof t === "string" ? t : "";
  const usable = token ? await resetTokenUsable(token) : false;
  return (
    <>
      <h1 className="h1">Yeni şifre belirleyin</h1>
      {usable ? (
        <NewPasswordForm token={token} />
      ) : (
        <div className="flash err" role="alert" data-testid="reset-invalid">
          Bağlantı geçersiz, kullanılmış veya süresi dolmuş. <Link href="/sifremi-unuttum">Yeni bağlantı isteyin</Link>.
        </div>
      )}
    </>
  );
}
