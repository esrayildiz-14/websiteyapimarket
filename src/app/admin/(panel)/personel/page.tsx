import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createStaffAction, resetMfaAction, updateStaffAction } from "./actions";

export const metadata = { title: "Personel ve roller" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function StaffPage({ searchParams }: { searchParams: SP }) {
  const me = await requireStaff("user.manage");
  const sp = await searchParams;
  const [staff, roles] = await Promise.all([
    prisma.user.findMany({ where: { type: "STAFF", deletedAt: null }, include: { role: true }, orderBy: [{ isActive: "desc" }, { firstName: "asc" }] }),
    prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Personel ve roller</h1>
          <p>Her personel yalnız rolünün izin verdiği ekran ve işlemleri kullanabilir; yetki her sunucu işleminde ayrıca kontrol edilir.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className="tbl-wrap">
        <table className="tbl" data-testid="staff-table">
          <thead><tr><th>Personel</th><th>Rol ve durum</th><th>2FA</th><th>Son giriş</th><th /></tr></thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} data-testid={`staff-row-${u.email}`}>
                <td><b>{u.firstName} {u.lastName}</b><div className="muted">{u.email}{u.id === me.id ? " · siz" : ""}</div></td>
                <td>
                  <form action={updateStaffAction} className="actions">
                    <input type="hidden" name="id" value={u.id} />
                    <select className="oy-select" name="roleId" defaultValue={u.roleId ?? ""} aria-label={`${u.email} rol`}>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <label className="oy-check"><input type="checkbox" name="isActive" defaultChecked={u.isActive} aria-label={`${u.email} aktif`} /><span>Aktif</span></label>
                    <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">Kaydet</button>
                  </form>
                </td>
                <td>
                  {u.totpEnabledAt ? (
                    <form action={resetMfaAction}><input type="hidden" name="id" value={u.id} /><span className="pill on">Etkin</span> <button className="oy-btn oy-btn--ghost oy-btn--sm" type="submit">Sıfırla</button></form>
                  ) : <span className="pill off">Kapalı</span>}
                </td>
                <td className="muted">{u.lastLoginAt ? u.lastLoginAt.toLocaleString("tr-TR") : "—"}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card">
        <h2>Yeni personel</h2>
        <ActionForm action={createStaffAction} testId="staff-form">
          <div className="form-grid">
            <label className="oy-field"><span className="oy-field__label req">E-posta</span><input className="oy-input" name="email" type="email" required /></label>
            <label className="oy-field"><span className="oy-field__label req">Ad</span><input className="oy-input" name="firstName" required /></label>
            <label className="oy-field"><span className="oy-field__label req">Soyad</span><input className="oy-input" name="lastName" required /></label>
            <label className="oy-field">
              <span className="oy-field__label req">Rol</span>
              <select className="oy-select" name="roleId" defaultValue="">
                <option value="" disabled>Seçin</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="oy-field">
              <span className="oy-field__label req">Geçici şifre</span>
              <input className="oy-input" name="password" type="password" autoComplete="new-password" required />
              <span className="oy-field__hint">En az 12 karakter. Personel ilk girişte Şifre değiştir sayfasından değiştirmeli.</span>
            </label>
          </div>
          <div className="actions"><button className="oy-btn oy-btn--primary" type="submit" data-testid="staff-submit">Personeli ekle</button></div>
        </ActionForm>
      </section>

      <section className="card">
        <h2>Rollerin yetkileri</h2>
        <table className="tbl" data-testid="role-matrix">
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}><b>{r.name}</b></td>
                <td className="muted">{r.key === "SUPER_ADMIN" ? "Tüm yetkiler" : r.permissions.map((p) => PERMISSIONS[p.permission.key as keyof typeof PERMISSIONS] ?? p.permission.key).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
