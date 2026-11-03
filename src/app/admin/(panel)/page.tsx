import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";

export const metadata = { title: "Dashboard" };

const STATUS_TR: Record<string, string> = {
  PENDING_PAYMENT: "Ödeme bekleniyor", PAID: "Ödeme onaylandı", PREPARING: "Hazırlanıyor", SHIPPED: "Kargoya verildi",
  DELIVERED: "Teslim edildi", CANCELLED: "İptal edildi", RETURN_REQUESTED: "İade talebi", REFUNDED: "İade edildi",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff("dashboard.view");
  const sp = await searchParams;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidStatuses = ["PAID", "PREPARING", "SHIPPED", "DELIVERED"] as const;

  // Demo/test siparişleri ve TEST ödemeleri satış rakamlarına katılmaz
  const real = { isDemo: false, payments: { none: { isTest: true, status: "SUCCESS" as const } } };
  const [productTotal, productActive, categoryCount, orderTotal, pending, toPrepare, completed, today, month, revenue, lowStock, recent, outOfStock] =
    await Promise.all([
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.product.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      prisma.category.count(),
      prisma.order.count({ where: { isDemo: false } }),
      prisma.order.count({ where: { isDemo: false, status: "PENDING_PAYMENT" } }),
      prisma.order.count({ where: { isDemo: false, status: { in: ["PAID", "PREPARING"] } } }),
      prisma.order.count({ where: { isDemo: false, status: "DELIVERED" } }),
      prisma.order.aggregate({ _sum: { grandTotal: true }, where: { ...real, status: { in: [...paidStatuses] }, paidAt: { gte: dayStart } } }),
      prisma.order.aggregate({ _sum: { grandTotal: true }, where: { ...real, status: { in: [...paidStatuses] }, paidAt: { gte: monthStart } } }),
      prisma.order.aggregate({ _sum: { grandTotal: true }, where: { ...real, status: { in: [...paidStatuses] } } }),
      prisma.$queryRaw<{ id: string; name: string; sku: string; stock: number; minStock: number }[]>`
        SELECT p.id, p.name, p.sku,
               (COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0))::int AS stock, COALESCE(i."minStock", 0)::int AS "minStock"
        FROM products p LEFT JOIN inventory i ON i."productId" = p.id
        WHERE p."deletedAt" IS NULL AND COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0) <= COALESCE(i."minStock", 0)
        ORDER BY stock ASC LIMIT 10`,
      prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM products p LEFT JOIN inventory i ON i."productId" = p.id
        WHERE p."deletedAt" IS NULL AND p.status = 'ACTIVE' AND COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0) <= 0`,
    ]);

  const stats = [
    { key: "urun", label: "Toplam ürün", value: productTotal, href: "/admin/urunler" },
    { key: "aktif", label: "Aktif ürün (sitede)", value: productActive, href: "/admin/urunler?durum=aktif" },
    { key: "pasif", label: "Pasif ürün", value: productTotal - productActive, href: "/admin/urunler?durum=pasif" },
    { key: "tukenen", label: "Aktif ama stokta yok", value: outOfStock[0]?.n ?? 0, warn: (outOfStock[0]?.n ?? 0) > 0, href: "/admin/stok?durum=kritik" },
    { key: "kategori", label: "Kategori", value: categoryCount, href: "/admin/kategoriler" },
    { key: "siparis", label: "Toplam sipariş", value: orderTotal, href: "/admin/siparisler" },
    { key: "bekleyen", label: "Ödeme bekleyen", value: pending, href: "/admin/siparisler?durum=PENDING_PAYMENT" },
    { key: "hazirlanacak", label: "Hazırlanacak", value: toPrepare, warn: toPrepare > 0, href: "/admin/siparisler?durum=PAID" },
    { key: "tamamlanan", label: "Tamamlanan", value: completed, href: "/admin/siparisler?durum=DELIVERED" },
    { key: "bugun", label: "Bugünkü satış", value: formatTL(Number(today._sum.grandTotal ?? 0)) },
    { key: "ay", label: "Bu ayki satış", value: formatTL(Number(month._sum.grandTotal ?? 0)) },
    { key: "ciro", label: "Toplam ciro", value: formatTL(Number(revenue._sum.grandTotal ?? 0)) },
    { key: "kritik", label: "Kritik stok (≤ minimum)", value: lowStock.length, warn: lowStock.length > 0, href: "/admin/stok?durum=kritik" },
  ];

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p>Satış tutarları ödemesi onaylanmış gerçek siparişlerden, KDV dahil hesaplanır (test ödemeleri hariç).</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className="grid-4" data-testid="dashboard-stats">
        {stats.map((s) => {
          const body = (
            <>
              <span>{s.label}</span>
              <b data-testid={`stat-${s.key}`}>{s.value}</b>
            </>
          );
          return s.href ? (
            <Link key={s.key} href={s.href} className={`stat${s.warn ? " warn" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
              {body}
            </Link>
          ) : (
            <div key={s.key} className={`stat${s.warn ? " warn" : ""}`}>
              {body}
            </div>
          );
        })}
      </div>
      <div className="actions" data-testid="quick-actions">
        <Link className="oy-btn oy-btn--primary oy-btn--sm" href="/admin/urunler/yeni">+ Yeni ürün</Link>
        <Link className="oy-btn oy-btn--outline oy-btn--sm" href="/admin/urunler/ice-aktar">Excel ile içe aktar</Link>
        <Link className="oy-btn oy-btn--outline oy-btn--sm" href="/admin/stok">Stok girişi</Link>
        <Link className="oy-btn oy-btn--outline oy-btn--sm" href="/admin/fiyatlar">Fiyat güncelle</Link>
        <Link className="oy-btn oy-btn--outline oy-btn--sm" href="/admin/sifre">Şifremi değiştir</Link>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Kritik stok</h2>
          {lowStock.length === 0 ? (
            <p className="muted">Minimum seviyenin altında ürün yok.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/urunler/${p.id}`}>{p.name}</Link>
                      <div className="muted">{p.sku}</div>
                    </td>
                    <td className="num">
                      <span className={`pill ${p.stock <= 0 ? "err" : "warn"}`}>
                        {p.stock} / min {p.minStock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2>Son siparişler</h2>
          {recent.length === 0 ? (
            <p className="muted">Henüz sipariş yok.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/siparisler/${o.id}`}>{o.orderNumber}</Link>
                      {o.isDemo && <span className="pill info" style={{ marginLeft: 6 }}>Demo</span>}
                      <div className="muted">{o.customerName}</div>
                    </td>
                    <td>{STATUS_TR[o.status]}</td>
                    <td className="num">{formatTL(o.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
