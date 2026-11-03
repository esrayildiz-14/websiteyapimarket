import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatTL } from "@/lib/money";
import { testProviderAllowed } from "@/server/payments";

export const metadata = { title: "TEST ödeme sağlayıcısı", robots: { index: false } };
type SP = Promise<Record<string, string | string[] | undefined>>;

/** YALNIZ otomatik testlerde etkin sahte ödeme sayfası. Gerçek ödeme almaz; üretimde ve normal veritabanında 404 döner. */
export default async function TestProvider({ searchParams }: { searchParams: SP }) {
  if (!testProviderAllowed()) notFound();
  const token = String((await searchParams).token ?? "");
  const p = await prisma.payment.findUnique({ where: { providerToken: token }, include: { order: true } });
  if (!p) notFound();
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h1 className="h1">TEST ödeme sağlayıcısı</h1>
      <p>Bu sayfa gerçek bir ödeme sayfası değildir; yalnız otomatik testlerde kullanılır.</p>
      <p>
        Sipariş {p.order.orderNumber} · {formatTL(p.amount)}
      </p>
      <form action="/api/odeme/test" method="post" className="actions">
        <input type="hidden" name="token" value={token} />
        <button className="oy-btn oy-btn--primary" name="sonuc" value="basarili" type="submit">
          Ödeme başarılı
        </button>
        <button className="oy-btn oy-btn--outline" name="sonuc" value="basarisiz" type="submit">
          Ödeme başarısız
        </button>
        <button className="oy-btn oy-btn--outline" name="sonuc" value="tutar" type="submit">
          Eksik tutar
        </button>
        <button className="oy-btn oy-btn--outline" name="sonuc" value="sessiz" type="submit">
          Ödendi, bildirim gelmedi
        </button>
      </form>
    </div>
  );
}
