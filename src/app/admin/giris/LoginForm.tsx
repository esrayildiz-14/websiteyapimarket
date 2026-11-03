"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      {state.error && (
        <div className="flash err" role="alert" data-testid="login-error">
          {state.error}
        </div>
      )}
      <label className="oy-field">
        <span className="oy-field__label">E-posta</span>
        <input className="oy-input" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Şifre</span>
        <input className="oy-input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="oy-btn oy-btn--secondary oy-btn--lg oy-btn--block" type="submit" disabled={pending}>
        {pending ? "Kontrol ediliyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
