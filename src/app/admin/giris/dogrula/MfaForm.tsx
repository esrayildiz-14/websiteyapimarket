"use client";

import { useActionState } from "react";
import { verifyMfaAction, type MfaState } from "../actions";

export default function MfaForm() {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyMfaAction, {});
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate data-testid="mfa-form">
      {state.error && (
        <div className="flash err" role="alert" data-testid="mfa-error">
          {state.error}
        </div>
      )}
      <label className="oy-field">
        <span className="oy-field__label">Doğrulama kodu</span>
        <input className="oy-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
      </label>
      <button className="oy-btn oy-btn--secondary oy-btn--lg oy-btn--block" type="submit" disabled={pending}>
        {pending ? "Kontrol ediliyor…" : "Doğrula"}
      </button>
    </form>
  );
}
