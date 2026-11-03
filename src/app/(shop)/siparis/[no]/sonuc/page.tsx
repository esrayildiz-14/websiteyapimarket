import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { formatTL } from "@/lib/money";

export const metadata = { title: "Sipariş sonucu", robots: { index: false } };

export default async function ResultPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const c = await getCurrentCustomer();
  const o = await prisma.order.findUnique({ where: { orderNumber: no }, include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  // sipariş yalnız sahibine gösterilir (oturum çerezi bu yönlendirmede gönderilir)
  if (!o || !c || o.userId !== c.id) notFound();
  const paid = ["PAID", "PREPARING", "SHIPPED", "DELIVERED"].includes(o.status);
  const pay = o.payments[0];
  return (
    <div className="card" style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 12 }} data-testid="order-result" data-status={o.status}>
      {paid ? (
        <>
          <h1 className="h1">Siparişiniz alındı</h1>
          <p>
            Sipariş numaranız: <b data-testid="order-number">{o.orderNumber}</b>
          </p>
          {pay?.isTest && <div className="flash warn">Bu sipariş TEST ödeme ortamında oluşturuldu; gerçek tahsilat yapılmadı.</div>}
          <p className="muted">Onay bilgileri {o.customerEmail} adresine hazırlandı. Siparişiniz kargoya verildiğinde bilgilendirileceksiniz.</p>
        </>
      ) : (
        <>
          <h1 className="h1">Ödeme tamamlanamadı</h1>
          <p>
            Sipariş {o.orderNumber}: {o.status === "PENDING_PAYMENT" ? "ödeme bekleniyor." : "ödeme alınamadığı için iptal edildi."}
          </p>
          {pay?.errorMessage && <div className="flash err">{pay.errorMessage}</div>}
          <p className="muted">Kartınızdan çekim yapılmadı. Sepetiniz korunuyor; tekrar deneyebilirsiniz.</p>
          <Link className="oy-btn oy-btn--primary" href="/sepet">
            Sepete dön
          </Link>
        </>
      )}
      <table className="tbl">
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id}>
              <td>
                {i.productName} × {i.quantity}
              </td>
              <td className="num">{formatTL(i.lineTotal)}</td>
            </tr>
          ))}
          <tr>
            <td>Kargo</td>
            <td className="num">{formatTL(o.shippingTotal)}</td>
          </tr>
          <tr>
            <td>
              <b>Toplam</b>
            </td>
            <td className="num">
              <b>{formatTL(o.grandTotal)}</b>
            </td>
          </tr>
        </tbody>
      </table>
      <Link href={`/siparis-takip?no=${o.orderNumber}&e=${encodeURIComponent(o.customerEmail)}`}>Sipariş takip sayfası</Link>
    </div>
  );
}
