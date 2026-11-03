import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Admin girişi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getCurrentStaff()) redirect("/admin");
  return (
    <main className="login-wrap">
      <div className="login-card">
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ font: "700 34px/0.9 var(--font-display)" }}>
            ÖNER<span style={{ color: "var(--orange-700)" }}>.</span>
          </span>
          <span style={{ font: "600 12px/14px var(--font-sans)", letterSpacing: "0.18em", color: "var(--ink-muted)" }}>YÖNETİM PANELİ</span>
        </div>
        <h1 className="h3">Admin girişi</h1>
        <LoginForm />
        <p className="muted" style={{ margin: 0 }}>
          5 hatalı denemeden sonra hesap 15 dakika kilitlenir. Şifrenizi unuttuysanız Super Admin ile iletişime geçin.
        </p>
      </div>
    </main>
  );
}
