import { requireStaff, mfaRequired } from "@/lib/auth/session";
import Flash from "@/components/admin/Flash";
import { pendingSetup } from "@/server/mfa";
import { confirmMfaAction, disableMfaAction, startMfaAction } from "./actions";

export const metadata = { title: "Hesap güvenliği" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SecurityPage({ searchParams }: { searchParams: SP }) {
  const user = await requireStaff(undefined, { allowWithoutMfa: true });
  const sp = await searchParams;
  const setup = user.mfaEnabled ? null : await pendingSetup(user.id);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Hesap güvenliği</h1>
          <p>İki adımlı doğrulama: girişte şifreye ek olarak telefonunuzdaki doğrulama uygulamasının ürettiği kod istenir.</p>
        </div>
      </div>
      <Flash sp={sp} />
      {mfaRequired() && !user.mfaEnabled && (
        <div className="flash warn" role="alert" data-testid="mfa-required">
          Yönetim paneli için iki adımlı doğrulama zorunludur. Devam etmek için aşağıdan etkinleştirin.
        </div>
      )}

      <section className="card" data-testid="mfa-status">
        <h2>Durum: {user.mfaEnabled ? "Etkin" : "Kapalı"}</h2>
        {user.mfaEnabled ? (
          <form action={disableMfaAction} className="form-grid" data-testid="mfa-disable-form">
            <label className="oy-field">
              <span className="oy-field__label req">Şifreniz</span>
              <input className="oy-input" name="password" type="password" autoComplete="current-password" required />
            </label>
            <label className="oy-field">
              <span className="oy-field__label req">Güncel kod</span>
              <input className="oy-input" name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" required />
            </label>
            <div className="actions full">
              <button className="oy-btn oy-btn--outline" type="submit">İki adımlı doğrulamayı kapat</button>
            </div>
          </form>
        ) : setup ? (
          <>
            <ol>
              <li>Telefonunuzda bir doğrulama uygulaması açın (Google Authenticator, Microsoft Authenticator vb.).</li>
              <li>
                &quot;Kurulum anahtarı gir&quot; seçeneğiyle şu anahtarı ekleyin:{" "}
                <code data-testid="mfa-secret" style={{ fontSize: 16, letterSpacing: "0.1em" }}>{setup.secret.match(/.{1,4}/g)!.join(" ")}</code>
              </li>
              <li>Uygulamanın gösterdiği 6 haneli kodu girin.</li>
            </ol>
            <p className="muted" style={{ wordBreak: "break-all" }}>
              Bağlantı (bazı uygulamalar kabul eder): <a href={setup.uri}>{setup.uri}</a>
            </p>
            <form action={confirmMfaAction} className="actions" data-testid="mfa-confirm-form">
              <input className="oy-input" name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" aria-label="Doğrulama kodu" required style={{ width: 140 }} />
              <button className="oy-btn oy-btn--primary" type="submit">Doğrula ve etkinleştir</button>
            </form>
          </>
        ) : (
          <form action={startMfaAction}>
            <button className="oy-btn oy-btn--primary" type="submit" data-testid="mfa-start">Kurulumu başlat</button>
          </form>
        )}
      </section>
    </>
  );
}
