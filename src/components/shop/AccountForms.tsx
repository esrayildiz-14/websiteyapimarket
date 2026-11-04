"use client";

import { useActionState } from "react";
import { changeCustomerPasswordAction, updateProfileAction, type AccountState } from "@/app/(shop)/actions";

function Msg({ s }: { s: AccountState }) {
  if (s.ok) return <div className="flash ok" role="status" data-testid="account-ok">{s.ok}</div>;
  if (s.error) return <div className="flash err" role="alert" data-testid="account-error">{s.error}</div>;
  return null;
}
const Err = ({ s, k }: { s: AccountState; k: string }) => (s.errors?.[k] ? <span className="oy-field__error" data-testid={`err-${k}`}>{s.errors[k]}</span> : null);

export function ProfileForm({ v }: { v: { firstName: string; lastName: string; phone: string } }) {
  const [s, action, pending] = useActionState<AccountState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="form-grid" data-testid="profile-form">
      <Msg s={s} />
      <label className="oy-field"><span className="oy-field__label req">Ad</span><input className="oy-input" name="firstName" defaultValue={v.firstName} autoComplete="given-name" required maxLength={60} /><Err s={s} k="firstName" /></label>
      <label className="oy-field"><span className="oy-field__label req">Soyad</span><input className="oy-input" name="lastName" defaultValue={v.lastName} autoComplete="family-name" required maxLength={60} /><Err s={s} k="lastName" /></label>
      <label className="oy-field"><span className="oy-field__label req">Cep telefonu</span><input className="oy-input" name="phone" defaultValue={v.phone} autoComplete="tel" inputMode="tel" required /><Err s={s} k="phone" /></label>
      <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" disabled={pending}>Kaydet</button></div>
    </form>
  );
}

export function PasswordForm() {
  const [s, action, pending] = useActionState<AccountState, FormData>(changeCustomerPasswordAction, {});
  return (
    <form action={action} className="form-grid" data-testid="password-form">
      <Msg s={s} />
      <label className="oy-field"><span className="oy-field__label req">Mevcut şifre</span><input className="oy-input" name="current" type="password" autoComplete="current-password" required /><Err s={s} k="current" /></label>
      <label className="oy-field"><span className="oy-field__label req">Yeni şifre</span><input className="oy-input" name="password" type="password" autoComplete="new-password" required /><Err s={s} k="password" /><span className="oy-field__hint">En az 12 karakter.</span></label>
      <label className="oy-field"><span className="oy-field__label req">Yeni şifre (tekrar)</span><input className="oy-input" name="confirm" type="password" autoComplete="new-password" required /><Err s={s} k="confirm" /></label>
      <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit" disabled={pending}>Şifreyi değiştir</button></div>
    </form>
  );
}
