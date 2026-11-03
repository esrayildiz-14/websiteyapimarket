export type BrandValues = { name: string; slug: string; description: string; sortOrder: number; isActive: boolean; logoUrl: string | null };

export default function BrandFields({ v }: { v: BrandValues }) {
  return (
    <div className="form-grid">
      <label className="oy-field">
        <span className="oy-field__label req">Marka adı</span>
        <input className="oy-input" name="name" defaultValue={v.name} maxLength={60} required />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Adres (slug)</span>
        <input className="oy-input" name="slug" defaultValue={v.slug} maxLength={120} placeholder="Boşsa addan üretilir" />
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Sıra</span>
        <input className="oy-input" name="sortOrder" type="number" min={0} max={9999} defaultValue={v.sortOrder} />
      </label>
      <label className="oy-check" style={{ alignSelf: "end", minHeight: 44 }}>
        <input type="checkbox" name="isActive" defaultChecked={v.isActive} />
        <span>Aktif (marka alanında görünür)</span>
      </label>
      <label className="oy-field">
        <span className="oy-field__label">Logo</span>
        <input className="oy-input" type="file" name="logo" accept="image/jpeg,image/png,image/webp" style={{ paddingTop: 8 }} />
        <span className="oy-field__hint">Logo kullanımı için marka sahibinin izni gerekir.</span>
      </label>
      {v.logoUrl && (
        <div className="oy-field">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.logoUrl} alt="" style={{ width: 120, height: 60, objectFit: "contain", background: "var(--surface-alt)", borderRadius: 6 }} />
          <label className="oy-check">
            <input type="checkbox" name="removeLogo" />
            <span>Logoyu kaldır</span>
          </label>
        </div>
      )}
      <label className="oy-field full">
        <span className="oy-field__label">Açıklama</span>
        <textarea className="oy-input" name="description" defaultValue={v.description} rows={3} maxLength={1000} />
      </label>
    </div>
  );
}
