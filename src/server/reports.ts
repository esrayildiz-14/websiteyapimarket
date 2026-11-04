import "server-only";
import { prisma } from "@/lib/prisma";
import { aggregate, byDim, istanbulDayStart, istanbulMonthStart, periodKey, type Dim, type Fact, type Group } from "@/lib/report-calc";
import { round2 } from "@/lib/money";

export type ReportInput = { from: Date; to: Date; group: Group; dim: Dim; includeTest: boolean };

type RawFact = {
  date: Date; channel: "ONLINE" | "MAGAZA"; productId: string | null; productName: string; sku: string; category: string | null;
  brand: string | null; customer: string | null; qty: number; gross: string; vat_rate: number; avg: string | null; manual: string | null;
};

/**
 * Satış olguları — yalnız veritabanındaki gerçek kayıtlardan:
 *  - online satış: ödemesi alınmış siparişlerin kalemleri (ödeme tarihinde); kupon indirimi satırlara oranlanır; kargo ayrı
 *  - online iade/iptal: ödenmiş olup İPTAL / İADE durumuna geçen siparişler (geçiş tarihinde, eksi)
 *  - mağaza satışı, mağaza iptali (eksi), mağaza iadesi (eksi)
 * Demo siparişler hiç; test sağlayıcı / sandbox ödemeli siparişler yalnız "test dahil" seçilirse sayılır.
 */
async function facts(i: ReportInput): Promise<Fact[]> {
  const rows = await prisma.$queryRaw<RawFact[]>`
    WITH online AS (
      SELECT o.id, o."paidAt", o.status, o."discountTotal", o.subtotal, COALESCE(o."customerName", 'Misafir') AS customer
      FROM orders o
      WHERE o."paidAt" IS NOT NULL AND o."isDemo" = false
        AND (${i.includeTest} OR NOT EXISTS (SELECT 1 FROM payments p WHERE p."orderId" = o.id AND p.status = 'SUCCESS' AND p."isTest"))
    ),
    f AS (
      SELECT o."paidAt" AS date, 'ONLINE' AS channel, oi."productId", oi."productName", oi.sku, oi.quantity AS qty,
             oi."lineTotal" * (1 - COALESCE(o."discountTotal" / NULLIF(o.subtotal, 0), 0)) AS gross, oi."vatRate" AS vat_rate, o.customer
      FROM online o JOIN order_items oi ON oi."orderId" = o.id
      UNION ALL
      SELECT (SELECT MAX(h."createdAt") FROM order_status_history h WHERE h."orderId" = o.id AND h."toStatus" IN ('CANCELLED', 'REFUNDED')),
             'ONLINE', oi."productId", oi."productName", oi.sku, -oi.quantity,
             -(oi."lineTotal" * (1 - COALESCE(o."discountTotal" / NULLIF(o.subtotal, 0), 0))), oi."vatRate", o.customer
      FROM online o JOIN order_items oi ON oi."orderId" = o.id WHERE o.status IN ('CANCELLED', 'REFUNDED')
      UNION ALL
      SELECT s."createdAt", 'MAGAZA', si."productId", si.name, si.sku, si.quantity, si."lineTotal", si."vatRate", COALESCE(s."customerName", 'Mağaza müşterisi')
      FROM store_sales s JOIN store_sale_items si ON si."storeSaleId" = s.id
      UNION ALL
      SELECT s."cancelledAt", 'MAGAZA', si."productId", si.name, si.sku, -si.quantity, -si."lineTotal", si."vatRate", COALESCE(s."customerName", 'Mağaza müşterisi')
      FROM store_sales s JOIN store_sale_items si ON si."storeSaleId" = s.id WHERE s.status = 'CANCELLED'
      UNION ALL
      SELECT r."createdAt", 'MAGAZA', si."productId", si.name, si.sku, -ri.quantity, -ri.amount, si."vatRate", COALESCE(s."customerName", 'Mağaza müşterisi')
      FROM store_returns r JOIN store_return_items ri ON ri."storeReturnId" = r.id JOIN store_sale_items si ON si.id = ri."storeSaleItemId"
      JOIN store_sales s ON s.id = r."storeSaleId"
    )
    SELECT f.date, f.channel, f."productId", f."productName", f.sku, f.qty::int AS qty, f.gross::text AS gross, f.vat_rate,
           f.customer, COALESCE(pc.name || ' / ' || c.name, c.name, 'Silinmiş ürün') AS category, COALESCE(b.name, 'Markasız') AS brand,
           p."avgCost"::text AS avg, p."purchasePrice"::text AS manual
    FROM f
    LEFT JOIN products p ON p.id = f."productId"
    LEFT JOIN categories c ON c.id = p."categoryId"
    LEFT JOIN categories pc ON pc.id = c."parentId"
    LEFT JOIN brands b ON b.id = p."brandId"
    WHERE f.date >= ${i.from} AND f.date < ${i.to}`;
  return rows.map((r) => {
    const gross = round2(Number(r.gross));
    const cost = r.avg !== null ? Number(r.avg) : r.manual !== null ? Number(r.manual) : null;
    return {
      date: r.date, channel: r.channel, productId: r.productId, productName: r.productName, sku: r.sku, category: r.category ?? "—",
      brand: r.brand ?? "Markasız", customer: r.customer ?? "—", qty: r.qty, gross, vat: round2((gross * r.vat_rate) / (100 + r.vat_rate)),
      unitCost: cost, costSource: r.avg !== null ? "ortalama" : r.manual !== null ? "elle" : "yok",
    } satisfies Fact;
  });
}

export async function salesReport(i: ReportInput, pre?: Fact[]) {
  const all = pre ?? (await facts(i));
  const periods = aggregate(all, (f) => ({ key: periodKey(f.date, i.group), label: periodKey(f.date, i.group) })).sort((a, b) => a.key.localeCompare(b.key));
  const dims = aggregate(all, byDim(i.dim)).sort((a, b) => b.net - a.net);
  const total = aggregate(all, () => ({ key: "t", label: "Toplam" }))[0] ?? null;
  const costSources = { ortalama: 0, elle: 0, yok: 0 };
  for (const f of all) if (f.qty > 0) costSources[f.costSource] += f.qty;
  return { periods, dims, total, costSources, factCount: all.length };
}

/**
 * Finansal özet. Bilinmeyen giderler (ödeme komisyonu, gerçek kargo gideri) sistemde kayıtlı olmadığı için
 * HESAPLANMAZ ve "kayıt yok" olarak gösterilir; tahmin uydurulmaz.
 */
export async function financialSummary(i: ReportInput) {
  const testFilter = i.includeTest ? {} : { isTest: false };
  const all = await facts(i);
  const [online, store, pending, shipping, report] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "SUCCESS", completedAt: { gte: i.from, lt: i.to }, order: { isDemo: false }, ...testFilter }, _sum: { amount: true } }),
    prisma.$queryRaw<{ inflow: string | null; outflow: string | null }[]>`
      SELECT SUM(amount) FILTER (WHERE amount > 0)::text AS inflow, SUM(-amount) FILTER (WHERE amount < 0)::text AS outflow
      FROM store_payments WHERE "createdAt" >= ${i.from} AND "createdAt" < ${i.to}`,
    prisma.order.aggregate({ where: { status: "PENDING_PAYMENT", isDemo: false }, _sum: { grandTotal: true }, _count: true }),
    prisma.order.aggregate({
      where: { paidAt: { gte: i.from, lt: i.to }, isDemo: false, ...(i.includeTest ? {} : { payments: { none: { isTest: true, status: "SUCCESS" } } }) },
      _sum: { shippingTotal: true },
    }),
    salesReport(i, all),
  ]);
  const refundsOnline = round2(all.filter((f) => f.channel === "ONLINE" && f.gross < 0).reduce((a, f) => a - f.gross, 0));
  const storeIn = Number(store[0]?.inflow ?? 0), storeOut = Number(store[0]?.outflow ?? 0);
  const collected = round2(Number(online._sum.amount ?? 0) + storeIn);
  const refunded = round2(refundsOnline + storeOut);
  const t = report.total;
  return {
    totalSales: round2(all.filter((f) => f.gross > 0).reduce((a, f) => a + f.gross, 0)), // iade öncesi satış (KDV dahil, kargo hariç)
    returnsInPeriod: round2(all.filter((f) => f.gross < 0).reduce((a, f) => a - f.gross, 0)), // dönemdeki iade/iptal (ürün tutarı)
    netSales: t?.gross ?? 0, // iadeler düşülmüş (KDV dahil)
    netSalesExVat: t?.net ?? 0,
    shippingRevenue: round2(Number(shipping._sum.shippingTotal ?? 0)),
    collected,
    pending: { amount: round2(Number(pending._sum.grandTotal ?? 0)), count: pending._count },
    refunded,
    cogs: t?.cogs ?? 0,
    uncostedQty: t?.uncostedQty ?? 0,
    grossProfit: t?.gross_profit ?? 0,
    netCash: round2(collected - refunded),
    commission: null as number | null, // iyzico komisyonu sistemde kayıtlı değil
    shippingCost: null as number | null, // kargo firmasına ödenen gerçek ücret kayıtlı değil
    costSources: report.costSources,
  };
}

export function parseReportInput(sp: Record<string, string | string[] | undefined>): ReportInput {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const today = new Date();
  const d = (v: string, fb: Date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return fb;
    const x = new Date(`${v}T00:00:00+03:00`);
    return Number.isNaN(x.getTime()) ? fb : x;
  };
  const from = d(s("bas"), istanbulMonthStart(today));
  const toDay = d(s("bit"), istanbulDayStart(today));
  const to = new Date(toDay.getTime() + 86_400_000); // bitiş günü dahil
  const group = (["gun", "hafta", "ay", "yil"] as const).find((g) => g === s("grup")) ?? "gun";
  const dim = (["urun", "kategori", "marka", "kanal", "musteri"] as const).find((x) => x === s("boyut")) ?? "urun";
  return { from, to, group, dim, includeTest: s("test") === "1" };
}
