export type WarehouseValues = { code: string; name: string; address: string; sellsOnline: boolean; isActive: boolean };

export default function WarehouseFields({ v, isDefault = false }: { v: WarehouseValues; isDefault?: boolean }) {
  return (
    <div className="form-grid">
      <label className="oy-field">
        <span className="oy-field__label req">Depo kodu</span>
        <input className="oy-input" name="code" defaultValue={v.code} maxLength={20} required style={{ textTransform: "uppercase" }} />
        <span className="oy-field__hint">Harf, rakam ve tire. Ör. MAGAZA-1</span>
      </label>
      <label className="oy-field">
        <span className="oy-field__label req">Depo adı</span>
        <input className="oy-input" name="name" defaultValue={v.name} maxLength={120} required />
      </label>
      <label className="oy-field full">
        <span className="oy-field__label">Adres</span>
        <input className="oy-input" name="address" defaultValue={v.address} maxLength={500} />
      </label>
      <label className="oy-check">
        <input type="checkbox" name="sellsOnline" defaultChecked={v.sellsOnline} disabled={isDefault} />
        <span>Online satışa açık (bu deponun stoğu sitede satılabilir)</span>
        {isDefault && <input type="hidden" name="sellsOnline" value="on" />}
      </label>
      <label className="oy-check">
        <input type="checkbox" name="isActive" defaultChecked={v.isActive} disabled={isDefault} />
        <span>Aktif</span>
        {isDefault && <input type="hidden" name="isActive" value="on" />}
      </label>
    </div>
  );
}
