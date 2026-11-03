"use client";

import { useActionState } from "react";
import { requestResetAction, resetPasswordAction, type ResetState } from "@/app/(shop)/actions";

export function RequestResetForm() {
  const [s, action, pending] = useActionState<ResetState, FormData>(requestResetAction, {});
  if (s.sent)
    return (
      <div className="flash ok" role="status" data-testid="reset-sent">
        Bu e-posta adresiyle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi. Bağlantı 30 dakika geçerlidir.
      </div>
    );
  return (
    <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }} data-testid="reset-request-form">
      <label className="oy-field">
        <span className="oy-field__label req">E-posta</span>
        <input className="oy-input" name="email" type="email" autoComplete="email" required />
      </label>
      <button className="oy-btn oy-btn--primary" type="submit" disabled={pending}>
        {pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </button>
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const [s, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="card" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }} data-testid="reset-form">
      {s.error && (
        <div className="flash err" role="alert" data-testid="reset-error">
          {s.error}
        </div>
      )}
      <input type="hidden" name="t" value={token} />
      <label className="oy-field">
        <span className="oy-field__label req">Yeni şifre</span>
        <input className="oy-input" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <span className="oy-field__hint">En az 12 karakter.</span>
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Yeni şifre (tekrar)</span>
        <input className="oy-input" name="confirm" type="password" autoComplete="new-password" required />
      </label>
      <button className="oy-btn oy-btn--primary" type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Şifreyi kaydet"}
      </button>
    </form>
  );
}
