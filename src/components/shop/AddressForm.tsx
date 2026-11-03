"use client";

import { useActionState, useEffect, useState } from "react";
import { saveAddressAction, type AuthState } from "@/app/(shop)/actions";

type Opt = { id: number; name: string };
type Mah = { name: string; postalCode: string };

/** İl → ilçe → mahalle seçimli adres formu. Seçenekler /api/adres'ten gelir; doğrulama sunucuda yapılır. */
export default function AddressForm({ provinces, next, defaults }: { provinces: Opt[]; next: string; defaults: { fullName: string; phone: string } }) {
  const [s, action, pending] = useActionState<AuthState, FormData>(saveAddressAction, {});
  const v = s.values ?? {};
  const [il, setIl] = useState(v.provinceId ?? "");
  const [ilce, setIlce] = useState(v.districtId ?? "");
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [mahs, setMahs] = useState<Mah[]>([]);
  const [mah, setMah] = useState(v.neighborhood ?? "");
  const [pk, setPk] = useState(v.postalCode ?? "");

  useEffect(() => {
    setDistricts([]);
    if (il) fetch(`/api/adres?il=${il}`).then((r) => r.json()).then(setDistricts).catch(() => setDistricts([]));
  }, [il]);
  useEffect(() => {
    setMahs([]);
    if (ilce) fetch(`/api/adres?ilce=${ilce}`).then((r) => r.json()).then(setMahs).catch(() => setMahs([]));
  }, [ilce]);

  const err = (k: string) =>
    s.errors?.[k] ? (
      <span className="oy-field__error" data-testid={`err-${k}`}>
        {s.errors[k]}
      </span>
    ) : null;

  return (
    <form action={action} className="form-grid" data-testid="address-form">
      {s.error && (
        <div className="flash err full" role="alert">
          {s.error}
        </div>
      )}
      <input type="hidden" name="devam" value={next} />
      <label className="oy-field">
        <span className="oy-field__label req">Adres başlığı</span>
        <input className="oy-input" name="title" defaultValue={v.title ?? "Ev"} maxLength={40} />
        {err("title")}
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Ad soyad</span>
        <input className="oy-input" name="fullName" defaultValue={v.fullName ?? defaults.fullName} />
        {err("fullName")}
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Cep telefonu</span>
        <input className="oy-input" name="phone" type="tel" defaultValue={v.phone ?? defaults.phone} />
        {err("phone")}
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">İl</span>
        <select className="oy-select" name="provinceId" value={il} onChange={(e) => { setIl(e.target.value); setIlce(""); setMah(""); setPk(""); }}>
          <option value="">Seçin</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {err("provinceId")}
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">İlçe</span>
        <select className="oy-select" name="districtId" value={ilce} onChange={(e) => { setIlce(e.target.value); setMah(""); setPk(""); }} disabled={!districts.length}>
          <option value="">Seçin</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {err("districtId")}
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Mahalle</span>
        <input
          className="oy-input"
          name="neighborhood"
          list="mahalle-listesi"
          value={mah}
          onChange={(e) => {
            setMah(e.target.value);
            const hit = mahs.find((m) => m.name === e.target.value);
            if (hit) setPk(hit.postalCode);
          }}
          placeholder={mahs.length ? "Listeden seçin veya yazın" : "Önce ilçe seçin"}
        />
        <datalist id="mahalle-listesi">
          {mahs.map((m) => (
            <option key={m.name} value={m.name} />
          ))}
        </datalist>
        {err("neighborhood")}
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Posta kodu</span>
        <input className="oy-input" name="postalCode" inputMode="numeric" maxLength={5} value={pk} onChange={(e) => setPk(e.target.value)} />
        {err("postalCode")}
      </label>
      <label className="oy-field full">
        <span className="oy-field__label req">Açık adres</span>
        <textarea className="oy-input" name="line" rows={2} defaultValue={v.line} placeholder="Cadde, sokak, bina no, daire no" />
        {err("line")}
      </label>
      <div className="actions full">
        <button className="oy-btn oy-btn--secondary" type="submit" disabled={pending} data-testid="address-submit">
          {pending ? "Kaydediliyor…" : "Adresi kaydet"}
        </button>
      </div>
    </form>
  );
}
