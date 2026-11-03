// Kategori formu alanları (yeni / düzenle ortak). Sunucu bileşeni; ActionForm içinde kullanılır.
type Opt = { id: string; name: string };
export type CategoryValues = {
  name: string; parentId: string; slug: string; description: string; seoTitle: string; seoDescription: string;
  defaultShippingProfileId: string; sortOrder: number; isActive: boolean; imageUrl: string | null;
};

export default function CategoryFields({ v, mains, profiles, lockParent }: { v: CategoryValues; mains: Opt[]; profiles: Opt[]; lockParent?: string }) {
  return (
    <>
      <section className="card">
        <h2>Kategori bilgileri</h2>
        <div className="form-grid">
          <label className="oy-field">
            <span className="oy-field__label req">Kategori adı</span>
            <input className="oy-input" name="name" defaultValue={v.name} maxLength={80} required />
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Üst kategori</span>
            <select className="oy-select" name="parentId" defaultValue={v.parentId}>
              <option value="">— Yok (ana kategori)</option>
              {mains.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {lockParent && <span className="oy-field__hint">{lockParent}</span>}
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Adres (slug)</span>
            <input className="oy-input" name="slug" defaultValue={v.slug} maxLength={120} placeholder="Boşsa addan üretilir" />
            <span className="oy-field__hint">Sayfa adresi: /kategori/{v.slug || "…"}</span>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Varsayılan kargo profili</span>
            <select className="oy-select" name="defaultShippingProfileId" defaultValue={v.defaultShippingProfileId}>
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="oy-field__hint">Bu kategoriye ürün eklenirken otomatik seçilir.</span>
          </label>
          <label className="oy-field">
            <span className="oy-field__label">Sıra</span>
            <input className="oy-input" name="sortOrder" type="number" min={0} max={9999} defaultValue={v.sortOrder} />
          </label>
          <label className="oy-check" style={{ alignSelf: "end", minHeight: 44 }}>
            <input type="checkbox" name="isActive" defaultChecked={v.isActive} />
            <span>Aktif (sitede görünür)</span>
          </label>
          <label className="oy-field full">
            <span className="oy-field__label">Açıklama</span>
            <textarea className="oy-input" name="description" defaultValue={v.description} rows={4} maxLength={2000} />
            <span className="oy-field__hint">Kategori sayfasının üstünde gösterilir.</span>
          </label>
        </div>
      </section>
      <section className="card">
        <h2>Görsel ve SEO</h2>
        <div className="form-grid">
          <label className="oy-field">
            <span className="oy-field__label">Kategori görseli</span>
            <input className="oy-input" type="file" name="image" accept="image/jpeg,image/png,image/webp" style={{ paddingTop: 8 }} />
            <span className="oy-field__hint">JPG, PNG veya WEBP, en fazla 5 MB.</span>
          </label>
          {v.imageUrl && (
            <div className="oy-field">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.imageUrl} alt="" style={{ width: 120, height: 90, objectFit: "contain", background: "var(--surface-alt)", borderRadius: 6 }} />
              <label className="oy-check">
                <input type="checkbox" name="removeImage" />
                <span>Görseli kaldır</span>
              </label>
            </div>
          )}
          <label className="oy-field">
            <span className="oy-field__label">SEO başlığı</span>
            <input className="oy-input" name="seoTitle" defaultValue={v.seoTitle} maxLength={70} />
            <span className="oy-field__hint">En fazla 70 karakter. Boşsa kategori adı kullanılır.</span>
          </label>
          <label className="oy-field full">
            <span className="oy-field__label">SEO açıklaması</span>
            <input className="oy-input" name="seoDescription" defaultValue={v.seoDescription} maxLength={170} />
            <span className="oy-field__hint">Arama sonuçlarında görünen açıklama, en fazla 170 karakter.</span>
          </label>
        </div>
      </section>
    </>
  );
}
