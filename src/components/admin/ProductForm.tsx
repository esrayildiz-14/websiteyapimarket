"use client";

import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { suggestProfile } from "@/lib/shipping";
import { parseDecimal, parseMoney, discountPercent } from "@/lib/money";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT } from "@/lib/image";
import { SALE_UNITS, SALE_UNIT_LABELS, VAT_RATES } from "@/lib/validation/product";
import type { ProductFormOptions } from "@/server/form-data";
import { generateBarcodeAction } from "@/app/admin/(panel)/urunler/actions";

export type ProductFormState = { message?: string; errors?: Record<string, string> };

export type ProductFormValues = {
  name: string; sku: string; barcode: string; mainCategoryId: string; subCategoryId: string; brandId: string; model: string; freeShipping: boolean;
  shortDescription: string; description: string; specs: { label: string; value: string }[];
  price: string; salePrice: string; purchasePrice: string; vatRate: string; stock: string; minStock: string; saleUnit: string;
  weightKg: string; widthCm: string; heightCm: string; lengthCm: string; shippingProfileId: string; handlingDays: string;
  status: "ACTIVE" | "PASSIVE"; isFeatured: boolean; seoTitle: string; seoDescription: string;
};

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "", sku: "", barcode: "", mainCategoryId: "", subCategoryId: "", brandId: "", model: "", freeShipping: false, shortDescription: "", description: "",
  specs: [{ label: "", value: "" }], price: "", salePrice: "", purchasePrice: "", vatRate: "20", stock: "0", minStock: "0",
  saleUnit: "ADET", weightKg: "", widthCm: "", heightCm: "", lengthCm: "", shippingProfileId: "", handlingDays: "2",
  status: "PASSIVE", isFeatured: false, seoTitle: "", seoDescription: "",
};

type Props = {
  options: ProductFormOptions;
  initial: ProductFormValues;
  action: (prev: ProductFormState, fd: FormData) => Promise<ProductFormState>;
  submitLabel: string;
  canSeePurchasePrice: boolean;
  existingImageCount?: number;
};

export default function ProductForm({ options, initial, action, submitLabel, canSeePurchasePrice, existingImageCount = 0 }: Props) {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(action, {});
  const errors = state.errors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  const [mainId, setMainId] = useState(initial.mainCategoryId);
  const [subId, setSubId] = useState(initial.subCategoryId);
  const [profileId, setProfileId] = useState(initial.shippingProfileId);
  const [profileTouched, setProfileTouched] = useState(!!initial.shippingProfileId);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [specs, setSpecs] = useState(initial.specs.length ? initial.specs : [{ label: "", value: "" }]);
  const [dims, setDims] = useState({ w: initial.weightKg, a: initial.widthCm, b: initial.heightCm, c: initial.lengthCm });
  const [price, setPrice] = useState({ p: initial.price, s: initial.salePrice });
  const [previews, setPreviews] = useState<{ url: string; name: string; size: number }[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  const main = options.categories.find((c) => c.id === mainId);
  const subs = main?.children ?? [];

  // Kategori seçilince (kullanıcı değiştirmediyse) kategorinin varsayılan kargo profili
  useEffect(() => {
    if (profileTouched) return;
    const sub = subs.find((s) => s.id === subId);
    const def = sub?.defaultProfileId ?? main?.defaultProfileId;
    if (def) setProfileId(def);
  }, [mainId, subId]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestion = useMemo(() => {
    const d = { weightKg: parseDecimal(dims.w), widthCm: parseDecimal(dims.a), heightCm: parseDecimal(dims.b), lengthCm: parseDecimal(dims.c) };
    if (Object.values(d).some((v) => v === null || v! <= 0)) return null;
    return suggestProfile(d as { weightKg: number; widthCm: number; heightCm: number; lengthCm: number });
  }, [dims]);
  const selectedProfile = options.profiles.find((p) => p.id === profileId);
  const suggestedProfile = suggestion?.code ? options.profiles.find((p) => p.code === suggestion.code) : null;

  const pct = discountPercent(parseMoney(price.p) ?? 0, parseMoney(price.s));

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    const files = Array.from(e.target.files ?? []);
    const tooBig = files.find((f) => f.size > MAX_IMAGE_BYTES);
    const tooMany = existingImageCount + files.length > MAX_IMAGES_PER_PRODUCT;
    const badType = files.find((f) => !["image/jpeg", "image/png", "image/webp"].includes(f.type));
    setImageError(
      tooBig ? `${tooBig.name} 5 MB'tan büyük.` : badType ? `${badType.name}: yalnız JPEG, PNG veya WebP.` : tooMany ? `Bir üründe en fazla ${MAX_IMAGES_PER_PRODUCT} görsel olabilir.` : null,
    );
    setPreviews(files.map((f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size })));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (imageError) return;
    const fd = new FormData(e.currentTarget);
    fd.set("specs", JSON.stringify(specs));
    startTransition(() => formAction(fd));
  }

  const err = (k: string) =>
    errors[k] ? (
      <span className="oy-field__error" data-testid={`err-${k}`}>
        {errors[k]}
      </span>
    ) : null;
  const fieldCls = (k: string) => `oy-field${errors[k] ? " oy-field--error" : ""}`;

  return (
    <form ref={formRef} action={formAction} onSubmit={submit} noValidate data-testid="product-form" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <input type="hidden" name="specs" value={JSON.stringify(specs)} />
      {state.message && (
        <div className="flash err" role="alert" data-testid="form-message">
          {state.message}
        </div>
      )}

      <section className="card">
        <h2>Temel bilgiler</h2>
        <div className="form-grid">
          <label className={fieldCls("name") + " full"}>
            <span className="oy-field__label req">Ürün adı</span>
            <input className="oy-input" name="name" defaultValue={initial.name} maxLength={200} required />
            <span className="oy-field__hint">Marka adını yazmayın; ölçü ve ambalajı sona ekleyin. Ör. "İç Cephe Silinebilir Boya 15 L Kırık Beyaz"</span>
            {err("name")}
          </label>
          <label className={fieldCls("sku")}>
            <span className="oy-field__label req">Ürün kodu (SKU)</span>
            <input className="oy-input" name="sku" defaultValue={initial.sku} maxLength={40} style={{ textTransform: "uppercase" }} required />
            {err("sku")}
          </label>
          <label className={fieldCls("barcode")}>
            <span className="oy-field__label">Barkod (EAN / GTIN) — isteğe bağlı</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={barcodeRef} className="oy-input" name="barcode" defaultValue={initial.barcode} inputMode="numeric" maxLength={20} placeholder="Ör. 8690000000012" />
              <button
                type="button"
                className="oy-btn oy-btn--outline oy-btn--sm"
                style={{ whiteSpace: "nowrap" }}
                data-testid="make-barcode"
                onClick={async () => {
                  const code = await generateBarcodeAction();
                  if (barcodeRef.current) barcodeRef.current.value = code;
                }}
              >
                Mağaza içi barkod oluştur
              </button>
            </div>
            <span className="oy-field__hint">
              Ambalajın üzerindeki barkodun altındaki numarayı yazın (8, 12, 13 veya 14 hane; boşluklar sorun değil). Ürünün barkodu yoksa boş bırakın
              veya mağaza içi barkod oluşturun (29 ile başlar, yalnız sizin mağazanızda geçerlidir).
            </span>
            {err("barcode")}
          </label>
          <label className={fieldCls("brandId")}>
            <span className="oy-field__label">Marka</span>
            <select className="oy-select" name="brandId" defaultValue={initial.brandId}>
              <option value="">Markasız</option>
              {options.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {err("brandId")}
          </label>
          <label className={fieldCls("model")}>
            <span className="oy-field__label">Model</span>
            <input className="oy-input" name="model" defaultValue={initial.model} maxLength={80} placeholder="Üretici model kodu" />
            {err("model")}
          </label>
          <label className={fieldCls("mainCategoryId")}>
            <span className="oy-field__label req">Ana kategori</span>
            <select
              className="oy-select"
              name="mainCategoryId"
              value={mainId}
              onChange={(e) => {
                setMainId(e.target.value);
                setSubId("");
              }}
              required
            >
              <option value="">Seçin</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.isActive}>
                  {c.name}
                  {c.isActive ? "" : " (pasif)"}
                </option>
              ))}
            </select>
            {err("mainCategoryId")}
          </label>
          <label className={fieldCls("subCategoryId")}>
            <span className={"oy-field__label" + (subs.length ? " req" : "")}>Alt kategori</span>
            <select className="oy-select" name="subCategoryId" value={subId} onChange={(e) => setSubId(e.target.value)} disabled={!subs.length}>
              <option value="">{mainId ? (subs.length ? "Seçin" : "Alt kategori yok") : "Önce ana kategori seçin"}</option>
              {subs.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.isActive}>
                  {c.name}
                  {c.isActive ? "" : " (pasif)"}
                </option>
              ))}
            </select>
            {err("subCategoryId")}
          </label>
          <label className={fieldCls("shortDescription") + " full"}>
            <span className="oy-field__label">Kısa açıklama</span>
            <input className="oy-input" name="shortDescription" defaultValue={initial.shortDescription} maxLength={300} />
            <span className="oy-field__hint">Ürün listelerinde ve arama sonuçlarında görünür (en fazla 300 karakter).</span>
          </label>
          <label className={fieldCls("description") + " full"}>
            <span className="oy-field__label">Açıklama</span>
            <textarea className="oy-input" name="description" defaultValue={initial.description} rows={7} maxLength={20000} />
            <span className="oy-field__hint">Düz metin; satır sonları korunur. HTML kabul edilmez.</span>
            {err("description")}
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Teknik özellikler</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="spec-row muted" aria-hidden="true">
            <span>Özellik</span>
            <span>Değer</span>
            <span style={{ width: 36 }} />
          </div>
          {specs.map((s, i) => (
            <div className="spec-row" key={i}>
              <input
                className="oy-input"
                aria-label={`Özellik ${i + 1} adı`}
                placeholder="Ör. Güç"
                value={s.label}
                maxLength={60}
                onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                className="oy-input"
                aria-label={`Özellik ${i + 1} değeri`}
                placeholder="Ör. 700 W"
                value={s.value}
                maxLength={160}
                onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
              <button
                type="button"
                className="oy-btn oy-btn--ghost oy-btn--sm"
                aria-label={`Özellik ${i + 1}'i sil`}
                onClick={() => setSpecs(specs.length > 1 ? specs.filter((_, j) => j !== i) : [{ label: "", value: "" }])}
              >
                ✕
              </button>
            </div>
          ))}
          {err("specs")}
          <div>
            <button type="button" className="oy-btn oy-btn--outline oy-btn--sm" onClick={() => setSpecs([...specs, { label: "", value: "" }])} disabled={specs.length >= 40}>
              + Özellik ekle
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Fiyat ve stok</h2>
        <div className="form-grid">
          <label className={fieldCls("price")}>
            <span className="oy-field__label req">Satış fiyatı (KDV dahil, ₺)</span>
            <input className="oy-input" name="price" inputMode="decimal" defaultValue={initial.price} placeholder="2.650,00" onChange={(e) => setPrice({ ...price, p: e.target.value })} required />
            {err("price")}
          </label>
          <label className={fieldCls("salePrice")}>
            <span className="oy-field__label">İndirimli fiyat (₺)</span>
            <input className="oy-input" name="salePrice" inputMode="decimal" defaultValue={initial.salePrice} onChange={(e) => setPrice({ ...price, s: e.target.value })} />
            <span className="oy-field__hint">{pct !== null ? `İndirim oranı: %${pct}` : "Boş bırakılırsa indirim yok."}</span>
            {err("salePrice")}
          </label>
          {canSeePurchasePrice && (
            <label className={fieldCls("purchasePrice")}>
              <span className="oy-field__label">Alış fiyatı (₺)</span>
              <input className="oy-input" name="purchasePrice" inputMode="decimal" defaultValue={initial.purchasePrice} />
              <span className="oy-field__hint">Müşteriye gösterilmez.</span>
              {err("purchasePrice")}
            </label>
          )}
          <label className={fieldCls("vatRate")}>
            <span className="oy-field__label req">KDV oranı</span>
            <select className="oy-select" name="vatRate" defaultValue={initial.vatRate}>
              {VAT_RATES.map((v) => (
                <option key={v} value={v}>
                  %{v}
                </option>
              ))}
            </select>
            {err("vatRate")}
          </label>
          <label className={fieldCls("saleUnit")}>
            <span className="oy-field__label req">Satış birimi</span>
            <select className="oy-select" name="saleUnit" defaultValue={initial.saleUnit}>
              {SALE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {SALE_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldCls("stock")}>
            <span className="oy-field__label req">Stok miktarı</span>
            <input className="oy-input" name="stock" type="number" min={0} step={1} defaultValue={initial.stock} />
            <span className="oy-field__hint">Değişiklik stok hareketlerine "düzeltme" olarak yazılır.</span>
            {err("stock")}
          </label>
          <label className={fieldCls("minStock")}>
            <span className="oy-field__label">Minimum stok (kritik seviye)</span>
            <input className="oy-input" name="minStock" type="number" min={0} step={1} defaultValue={initial.minStock} />
            {err("minStock")}
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Ağırlık, ölçü ve kargo</h2>
        <p className="muted" style={{ margin: "0 0 12px" }}>Paketli (kargoya verilecek) ağırlık ve ölçüleri girin; kargo ücreti bunlardan hesaplanır.</p>
        <div className="form-grid">
          <label className={fieldCls("weightKg")}>
            <span className="oy-field__label req">Ağırlık (kg)</span>
            <input className="oy-input" name="weightKg" inputMode="decimal" defaultValue={initial.weightKg} onChange={(e) => setDims({ ...dims, w: e.target.value })} />
            {err("weightKg")}
          </label>
          <label className={fieldCls("widthCm")}>
            <span className="oy-field__label req">En (cm)</span>
            <input className="oy-input" name="widthCm" inputMode="decimal" defaultValue={initial.widthCm} onChange={(e) => setDims({ ...dims, a: e.target.value })} />
            {err("widthCm")}
          </label>
          <label className={fieldCls("heightCm")}>
            <span className="oy-field__label req">Yükseklik (cm)</span>
            <input className="oy-input" name="heightCm" inputMode="decimal" defaultValue={initial.heightCm} onChange={(e) => setDims({ ...dims, b: e.target.value })} />
            {err("heightCm")}
          </label>
          <label className={fieldCls("lengthCm")}>
            <span className="oy-field__label req">Boy (cm)</span>
            <input className="oy-input" name="lengthCm" inputMode="decimal" defaultValue={initial.lengthCm} onChange={(e) => setDims({ ...dims, c: e.target.value })} />
            {err("lengthCm")}
          </label>
          <label className={fieldCls("shippingProfileId")}>
            <span className="oy-field__label req">Kargo profili</span>
            <select
              className="oy-select"
              name="shippingProfileId"
              value={profileId}
              onChange={(e) => {
                setProfileId(e.target.value);
                setProfileTouched(true);
              }}
            >
              <option value="">Seçin</option>
              {options.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            {selectedProfile && <span className="oy-field__hint">{selectedProfile.note}</span>}
            {err("shippingProfileId")}
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Kargoya teslim süresi (iş günü)</span>
            <input className="oy-input" name="handlingDays" type="number" min={0} max={60} defaultValue={initial.handlingDays} />
          </label>
        </div>
        {suggestion && (
          <div
            className={`flash ${suggestion.code === null ? "err" : suggestedProfile && suggestedProfile.id !== profileId ? "warn" : "ok"}`}
            style={{ marginTop: 12 }}
            data-testid="profile-suggestion"
          >
            {suggestion.code === null ? (
              <>Kargoyla gönderilemez: {suggestion.reason} Bu ürün aktif yapılamaz.</>
            ) : (
              <>
                Önerilen profil: <b>{suggestedProfile?.name ?? suggestion.code}</b> — {suggestion.reason}
                {suggestedProfile && suggestedProfile.id !== profileId && (
                  <button
                    type="button"
                    className="link-btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      setProfileId(suggestedProfile.id);
                      setProfileTouched(true);
                    }}
                  >
                    Öneriyi uygula
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Ürün fotoğrafları</h2>
        <label className={fieldCls("images")}>
          <span className="oy-field__label">Fotoğraf yükle</span>
          <input className="oy-input" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple onChange={onFiles} style={{ paddingTop: 8 }} />
          <span className="oy-field__hint">
            JPEG, PNG veya WebP; her biri en fazla 5 MB; ürün başına en fazla {MAX_IMAGES_PER_PRODUCT}. İlk görsel kapak olur.
            {existingImageCount > 0 && ` Üründe şu an ${existingImageCount} görsel var.`}
          </span>
          {imageError && (
            <span className="oy-field__error" data-testid="image-client-error">
              {imageError}
            </span>
          )}
          {err("images")}
        </label>
        {previews.length > 0 && (
          <div className="img-grid" style={{ marginTop: 12 }}>
            {previews.map((p, i) => (
              <div className="img-tile" key={p.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} />
                <div>
                  <span>{existingImageCount + i === 0 ? "Kapak" : `#${existingImageCount + i + 1}`}</span>
                  <span className="muted">{Math.round(p.size / 1024)} KB</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Yayın ve SEO</h2>
        <div className="form-grid">
          <fieldset className={fieldCls("status")} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="oy-field__label req" style={{ marginBottom: 6 }}>
              Durum
            </legend>
            <label className="oy-check">
              <input type="radio" name="status" value="ACTIVE" defaultChecked={initial.status === "ACTIVE"} />
              <span>Aktif — müşteri tarafında ilgili kategoride görünür</span>
            </label>
            <label className="oy-check">
              <input type="radio" name="status" value="PASSIVE" defaultChecked={initial.status === "PASSIVE"} />
              <span>Pasif — sitede görünmez</span>
            </label>
            {err("status")}
          </fieldset>
          <label className="oy-check" style={{ alignSelf: "start", marginTop: 26 }}>
            <input type="checkbox" name="isFeatured" defaultChecked={initial.isFeatured} />
            <span>Ana sayfada öne çıkar</span>
          </label>
          <label className="oy-check" style={{ alignSelf: "start", marginTop: 26 }}>
            <input type="checkbox" name="freeShipping" defaultChecked={initial.freeShipping} />
            <span>Bu ürün için kargo ücretsiz</span>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">SEO başlığı</span>
            <input className="oy-input" name="seoTitle" defaultValue={initial.seoTitle} maxLength={70} />
            <span className="oy-field__hint">Boşsa ürün adı kullanılır (en fazla 70 karakter).</span>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">SEO açıklaması</span>
            <input className="oy-input" name="seoDescription" defaultValue={initial.seoDescription} maxLength={170} />
          </label>
        </div>
      </section>

      <div className="actions" style={{ position: "sticky", bottom: 0, background: "var(--surface-alt)", padding: "12px 0" }}>
        <button className="oy-btn oy-btn--primary oy-btn--lg" type="submit" disabled={pending || !!imageError} data-testid="product-submit">
          {pending ? "Kaydediliyor…" : submitLabel}
        </button>
        <a className="oy-btn oy-btn--outline oy-btn--lg" href="/admin/urunler">
          Vazgeç
        </a>
      </div>
    </form>
  );
}
