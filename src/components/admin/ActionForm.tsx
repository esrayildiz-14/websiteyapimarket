"use client";

import { useActionState, useTransition } from "react";

export type FormState = { message?: string; errors?: Record<string, string> };

/**
 * Sunucu eylemine bağlı form. Hata olursa mesajları gösterir ve girilen değerleri korur
 * (React'in eylem sonrası formu sıfırlamasını engellemek için gönderimi kendisi yapar).
 */
export default function ActionForm({
  action,
  children,
  testId,
  className,
  encType,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  testId?: string;
  className?: string;
  encType?: "multipart/form-data";
}) {
  const [state, formAction] = useActionState(action, {});
  const [pending, start] = useTransition();
  const errors = Object.entries(state.errors ?? {});
  return (
    <form
      action={formAction}
      encType={encType}
      noValidate
      data-testid={testId}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(() => formAction(fd));
      }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {(state.message || errors.length > 0) && (
        <div className="flash err" role="alert" data-testid="form-message" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          {state.message && <b>{state.message}</b>}
          {errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map(([k, v]) => (
                <li key={k} data-testid={`err-${k}`}>
                  {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, display: "contents" }}>
        {children}
      </fieldset>
    </form>
  );
}
