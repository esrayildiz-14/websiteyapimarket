export type SupplierValues = {
  code: string; name: string; contactName: string; phone: string; email: string; address: string; taxOffice: string; taxNumber: string;
  productGroups: string; paymentTerms: string; avgLeadDays: string; status: string; notes: string;
};

export const EMPTY_SUPPLIER: SupplierValues = {
  code: "", name: "", contactName: "", phone: "", email: "", address: "", taxOffice: "", taxNumber: "",
  productGroups: "", paymentTerms: "", avgLeadDays: "", status: "ACTIVE", notes: "",
};

export const SUPPLIER_STATUS: Record<string, string> = { ACTIVE: "Aktif", PASSIVE: "Pasif", BLOCKED: "Engelli" };

const F = ({ name, label, v, req, ...rest }: { name: keyof SupplierValues; label: string; v: SupplierValues; req?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="oy-field">
    <span className={`oy-field__label${req ? " req" : ""}`}>{label}</span>
    <input className="oy-input" name={name} defaultValue={v[name]} {...rest} />
  </label>
);

export default function SupplierFields({ v }: { v: SupplierValues }) {
  return (
    <div className="form-grid">
      <F name="code" label="Tedarikçi kodu" v={v} req maxLength={30} style={{ textTransform: "uppercase" }} />
      <F name="name" label="Firma adı" v={v} req maxLength={200} />
      <F name="contactName" label="Yetkili kişi" v={v} maxLength={120} />
      <F name="phone" label="Telefon" v={v} maxLength={30} inputMode="tel" />
      <F name="email" label="E-posta" v={v} maxLength={200} type="email" />
      <F name="taxOffice" label="Vergi dairesi" v={v} maxLength={120} />
      <F name="taxNumber" label="Vergi no / T.C. kimlik no" v={v} maxLength={20} inputMode="numeric" />
      <F name="avgLeadDays" label="Ortalama teslim süresi (gün)" v={v} type="number" min={0} max={365} />
      <F name="paymentTerms" label="Ödeme koşulları" v={v} maxLength={200} placeholder="Ör. 30 gün vadeli" />
      <label className="oy-field">
        <span className="oy-field__label req">Durum</span>
        <select className="oy-select" name="status" defaultValue={v.status}>
          {Object.entries(SUPPLIER_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="oy-field full">
        <span className="oy-field__label">Adres</span>
        <input className="oy-input" name="address" defaultValue={v.address} maxLength={500} />
      </label>
      <label className="oy-field full">
        <span className="oy-field__label">Ürün grupları</span>
        <input className="oy-input" name="productGroups" defaultValue={v.productGroups} maxLength={500} placeholder="Ör. Elektrikli el aletleri, kaynak makineleri" />
      </label>
      <label className="oy-field full">
        <span className="oy-field__label">Açıklamalar</span>
        <textarea className="oy-input" name="notes" defaultValue={v.notes} rows={3} maxLength={2000} />
      </label>
    </div>
  );
}
