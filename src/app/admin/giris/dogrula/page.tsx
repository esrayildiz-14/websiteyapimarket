import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingMfaSession } from "@/lib/auth/session";
import MfaForm from "./MfaForm";

export const metadata: Metadata = { title: "İki adımlı doğrulama", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  if (!(await getPendingMfaSession())) redirect("/admin/giris");
  return (
    <main className="login-wrap">
      <div className="login-card">
        <h1 className="h3">İki adımlı doğrulama</h1>
        <p className="muted" style={{ margin: 0 }}>Doğrulama uygulamanızdaki (Google Authenticator, Microsoft Authenticator vb.) 6 haneli kodu girin.</p>
        <MfaForm />
      </div>
    </main>
  );
}
