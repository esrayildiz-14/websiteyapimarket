import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";
import { financialSummary, parseReportInput, salesReport } from "@/server/reports";
import PrintButton from "../kasa/[id]/PrintButton";

export const metadata = { title: "Raporlar" };
type SP = Promise<Record<string, string | string[] | undefined>>;

const DIM: Record<string, string> = { urun: "Ürün", kategori: "Kategori", marka: "Marka", kanal: "Satış kanalı", musteri: "Müşteri" };
const GROUP: Record<string, string> = { gun: "Günlük", hafta: "Haftalık", ay: "Aylık", yil: "Yıllık" };
const ymd = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  await requireStaff("finance.view");
  const sp = await searchParams;
  const input = parseReportInput(sp);
  const [rep, fin] = await Promise.all([salesReport(input), financialSummary(input)]);
  const qs = new URLSearchParams({ bas: ymd(input.from), bit: ymd(new Date(input.to.getTime() - 86_400_000)), grup: input.group, boyut: input.dim, ...(input.includeTest ? { test: "1" } : {}) });
  const Card = ({ label, value, id, hint }: { label: string; value: string; id: string; hint?: string }) => (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted">{label}</div>
      <b style={{ fontSize: 20 }} data-testid={id}>{value}</b>
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
  const Table = ({ rows, first, id }: { rows: typeof rep.dims; first: string; id: string }) => (
    <div className="tbl-wrap" style={{ border: 0 }}>
      <table className="tbl" data-testid={id}>
        <thead>
          <tr><th>{first}</th><th className="num">Adet</th><th className="num">Satış (KDV dahil)</th><th className="num">Net (KDV hariç)</th><th className="num">Maliyet</th><th className="num">Brüt kâr</th><th className="num">Marj</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-testid={`${id}-row`}>
              <td>{r.label}</td><td className="num">{r.qty}</td><td className="num">{formatTL(r.gross)}</td><td className="num">{formatTL(r.net)}</td>
              <td className="num">{formatTL(r.cogs)}{r.uncostedQty ? <div className="muted" style={{ fontSize: 12 }}>{r.uncostedQty} adet maliyetsiz</div> : null}</td>
              <td className="num">{formatTL(r.gross_profit)}</td><td className="num">{r.margin === null ? "—" : `%${r.margin}`}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="muted">Bu aralıkta satış yok.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Satış ve kârlılık raporları</h1>
          <p>Yalnız sistemdeki gerçek kayıtlardan. Bu ekran muhasebe programının yerine geçmez; resmî kayıtlar muhasebe sisteminde tutulur.</p>
        </div>
        <div className="actions no-print">
          <Link className="oy-btn oy-btn--outline oy-btn--sm" href={`/admin/rapor-indir?${qs}&format=xlsx`} data-testid="export-xlsx">Excel</Link>
          <Link className="oy-btn oy-btn--outline oy-btn--sm" href={`/admin/rapor-indir?${qs}&format=csv`} data-testid="export-csv">CSV</Link>
          <PrintButton />
        </div>
      </div>
      <form className="card form-grid no-print" data-testid="report-filter">
        <label className="oy-field"><span className="oy-field__label">Başlangıç</span><input className="oy-input" type="date" name="bas" defaultValue={ymd(input.from)} /></label>
        <label className="oy-field"><span className="oy-field__label">Bitiş</span><input className="oy-input" type="date" name="bit" defaultValue={ymd(new Date(input.to.getTime() - 86_400_000))} /></label>
        <label className="oy-field"><span className="oy-field__label">Dönem</span>
          <select className="oy-select" name="grup" defaultValue={input.group}>{Object.entries(GROUP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="oy-field"><span className="oy-field__label">Kırılım</span>
          <select className="oy-select" name="boyut" defaultValue={input.dim}>{Object.entries(DIM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="oy-check"><input type="checkbox" name="test" value="1" defaultChecked={input.includeTest} /><span>Test / sandbox ödemelerini dahil et</span></label>
        <div className="actions full"><button className="oy-btn oy-btn--primary" type="submit">Göster</button></div>
      </form>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }} data-testid="fin-summary">
        <Card label="Toplam satış (KDV dahil)" value={formatTL(fin.totalSales)} id="fin-total" hint="İade öncesi, kargo hariç" />
        <Card label="İade / iptal" value={formatTL(fin.returnsInPeriod)} id="fin-returns" />
        <Card label="Net satış (KDV hariç)" value={formatTL(fin.netSalesExVat)} id="fin-net" />
        <Card label="Ürün maliyeti" value={formatTL(fin.cogs)} id="fin-cogs" hint={fin.uncostedQty ? `${fin.uncostedQty} adet maliyeti bilinmiyor` : "Ortalama maliyet / elle girilen alış fiyatı"} />
        <Card label="Brüt kâr" value={formatTL(fin.grossProfit)} id="fin-gp" hint="Net satış − ürün maliyeti" />
        <Card label="Kargo geliri (müşteriden)" value={formatTL(fin.shippingRevenue)} id="fin-ship" />
        <Card label="Tahsil edilen" value={formatTL(fin.collected)} id="fin-collected" hint="Online ödemeler + kasa tahsilatı" />
        <Card label="Geri ödenen" value={formatTL(fin.refunded)} id="fin-refunded" />
        <Card label="Net nakit hareketi" value={formatTL(fin.netCash)} id="fin-cash" />
        <Card label="Bekleyen tahsilat" value={`${formatTL(fin.pending.amount)} (${fin.pending.count})`} id="fin-pending" hint="Ödeme bekleyen online siparişler (şu an)" />
        <Card label="Ödeme komisyonu" value="Kayıt yok" id="fin-commission" hint="iyzico komisyonu sistemde kayıtlı değil" />
        <Card label="Kargo gideri" value="Kayıt yok" id="fin-shipcost" hint="Kargo firmasına ödenen ücret kayıtlı değil" />
      </div>
      <p className="muted">
        Katkı kârı ve net işletme kârı, ödeme komisyonu ve kargo gideri kayıt altına alınana kadar hesaplanmaz. Maliyet kaynağı (satılan adet):
        ortalama maliyet {fin.costSources.ortalama}, elle girilen alış fiyatı {fin.costSources.elle}, bilinmiyor {fin.costSources.yok}.
        Maliyet, satış anındaki değil bugünkü ortalama maliyetle hesaplanır.
      </p>

      <section className="card"><h2>{GROUP[input.group]} satış</h2><Table rows={rep.periods} first="Dönem" id="period-table" /></section>
      <section className="card"><h2>{DIM[input.dim]} bazında</h2><Table rows={rep.dims} first={DIM[input.dim]} id="dim-table" /></section>
    </>
  );
}
