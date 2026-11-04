import ExcelJS from "exceljs";
import { getCurrentStaff, can } from "@/lib/auth/session";
import { toCsv } from "@/lib/report-calc";
import { parseReportInput, salesReport } from "@/server/reports";

const DIM: Record<string, string> = { urun: "Ürün", kategori: "Kategori", marka: "Marka", kanal: "Satış kanalı", musteri: "Müşteri" };

/** Rapor dışa aktarma (CSV / Excel). Yetki: finance.view. */
export async function GET(req: Request) {
  const user = await getCurrentStaff();
  if (!user || !can(user, "finance.view")) return new Response("Yetkiniz yok.", { status: 403 });
  const url = new URL(req.url);
  const input = parseReportInput(Object.fromEntries(url.searchParams.entries()));
  const rep = await salesReport(input);
  const header = ["Tür", "Anahtar", "Adet", "Satış (KDV dahil)", "Net (KDV hariç)", "KDV", "Maliyet", "Maliyetsiz adet", "Brüt kâr", "Marj %"];
  const rows = [
    ...rep.periods.map((r) => ["Dönem", r.label, r.qty, r.gross, r.net, r.vat, r.cogs, r.uncostedQty, r.gross_profit, r.margin]),
    ...rep.dims.map((r) => [DIM[input.dim], r.label, r.qty, r.gross, r.net, r.vat, r.cogs, r.uncostedQty, r.gross_profit, r.margin]),
  ] as (string | number | null)[][];
  const name = `rapor-${url.searchParams.get("bas") ?? ""}-${url.searchParams.get("bit") ?? ""}`.replace(/[^a-z0-9-]/gi, "");
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (url.searchParams.get("format") === "csv") {
    return new Response(toCsv(header, rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rapor");
  ws.addRow(header).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 40 : 16; if (i >= 3 && i !== 7) c.numFmt = "#,##0.00"; });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
  });
}
