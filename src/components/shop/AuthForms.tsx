"use client";

import { useActionState } from "react";
import { customerLoginAction, registerAction, type AuthState } from "@/app/(shop)/actions";

function Err({ s, k }: { s: AuthState; k: string }) {
  const m = s.errors?.[k];
  return m ? (
    <span className="oy-field__error" data-testid={`err-${k}`}>
      {m}
    </span>
  ) : null;
}

export function LoginForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState(customerLoginAction, {});
  return (
    <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="login-form">
      <h2>Giriş yap</h2>
      {s.error && (
        <div className="flash err" role="alert" data-testid="login-error">
          {s.error}
        </div>
      )}
      <input type="hidden" name="devam" value={next} />
      <label className="oy-field">
        <span className="oy-field__label">E-posta</span>
        <input className="oy-input" name="email" type="email" autoComplete="username" defaultValue={s.values?.email} required />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Şifre</span>
        <input className="oy-input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="oy-btn oy-btn--primary oy-btn--block" type="submit" disabled={pending}>
        {pending ? "Kontrol ediliyor…" : "Giriş yap"}
      </button>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState(registerAction, {});
  const v = s.values ?? {};
  return (
    <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="register-form">
      <h2>Üye ol</h2>
      {s.error && (
        <div className="flash err" role="alert" data-testid="register-error">
          {s.error}
        </div>
      )}
      <input type="hidden" name="devam" value={next} />
      <div className="form-grid">
        <label className="oy-field">
          <span className="oy-field__label req">Ad</span>
          <input className="oy-input" name="firstName" defaultValue={v.firstName} autoComplete="given-name" />
          <Err s={s} k="firstName" />
        </label>
        <label className="oy-field">
          <span className="oy-field__label req">Soyad</span>
          <input className="oy-input" name="lastName" defaultValue={v.lastName} autoComplete="family-name" />
          <Err s={s} k="lastName" />
        </label>
      </div>
      <label className="oy-field">
        <span className="oy-field__label req">E-posta</span>
        <input className="oy-input" name="email" type="email" defaultValue={v.email} autoComplete="email" />
        <Err s={s} k="email" />
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Cep telefonu</span>
        <input className="oy-input" name="phone" type="tel" defaultValue={v.phone} placeholder="05xx xxx xx xx" autoComplete="tel" />
        <Err s={s} k="phone" />
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Şifre</span>
        <input className="oy-input" name="password" type="password" autoComplete="new-password" />
        <span className="oy-field__hint">En az 12 karakter.</span>
        <Err s={s} k="password" />
      </label>
      <label className="oy-check">
        <input type="checkbox" name="kvkk" />
        <span>
          <a href="/sayfa/kvkk" target="_blank">
            KVKK Aydınlatma Metni
          </a>
          ’ni okudum.
        </span>
      </label>
      <Err s={s} k="kvkk" />
      <label className="oy-check">
        <input type="checkbox" name="marketing" />
        <span>Kampanyalardan e-posta ve SMS ile haberdar olmak istiyorum (isteğe bağlı).</span>
      </label>
      <button className="oy-btn oy-btn--secondary oy-btn--block" type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Üye ol"}
      </button>
    </form>
  );
}
