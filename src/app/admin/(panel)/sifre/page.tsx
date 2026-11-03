import { requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import { changePasswordAction } from "./actions";

export const metadata = { title: "Şifremi değiştir" };

export default async function PasswordPage() {
  await requireStaff();
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Şifremi değiştir</h1>
          <p>Yeni şifre en az 12 karakter olmalı. Değişiklikten sonra diğer cihazlardaki oturumlarınız kapanır.</p>
        </div>
      </div>
      <section className="card" style={{ maxWidth: 520 }}>
        <ActionForm action={changePasswordAction} testId="password-form">
          <label className="oy-field">
            <span className="oy-field__label req">Mevcut şifre</span>
            <input className="oy-input" type="password" name="current" autoComplete="current-password" />
          </label>
          <label className="oy-field">
            <span className="oy-field__label req">Yeni şifre</span>
            <input className="oy-input" type="password" name="next" autoComplete="new-password" />
          </label>
          <label className="oy-field">
            <span className="oy-field__label req">Yeni şifre (tekrar)</span>
            <input className="oy-input" type="password" name="again" autoComplete="new-password" />
          </label>
          <div className="actions">
            <button className="oy-btn oy-btn--primary" type="submit" data-testid="password-submit">
              Şifreyi değiştir
            </button>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
