import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import WarehouseFields from "../WarehouseFields";
import { updateWarehouseAction } from "../actions";

export const metadata = { title: "Depo" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function WarehousePage({ params, searchParams }: Props) {
  const user = await requireStaff("product.read");
  const { id } = await params;
  const sp = await searchParams;
  const w = await prisma.warehouse.findUnique({ where: { id } });
  if (!w) notFound();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const like = `%${q}%`;
  const rows = await prisma.$queryRaw<{ sku: string; name: string; productId: string; quantity: number }[]>`
    SELECT COALESCE(v.sku, p.sku) AS sku, COALESCE(p.name || ' · ' || v.name, p.name) AS name, p.id AS "productId", s.quantity
    FROM warehouse_stocks s
    JOIN inventory i ON i.id = s."inventoryId"
    LEFT JOIN product_variants v ON v.id = i."variantId"
    JOIN products p ON p.id = COALESCE(i."productId", v."productId")
    WHERE s."warehouseId" = ${id} AND s.quantity > 0
      AND (${q} = '' OR p.name ILIKE ${like} OR p.sku ILIKE ${like} OR p.barcode = ${q} OR v.sku ILIKE ${like})
    ORDER BY p.name
    LIMIT 300`;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{w.name}</h1>
          <p>
            {w.code} · {w.sellsOnline ? "Online satışa açık" : "Online satışa kapalı"}
            {w.isDefault ? " · varsayılan depo" : ""}
          </p>
        </div>
        <div className="actions">
          <Link className="oy-btn oy-btn--ghost oy-btn--sm" href="/admin/depolar">← Depolar</Link>
        </div>
      </div>
      <Flash sp={sp} />

      <section className="card">
        <h2>Depodaki ürünler</h2>
        <form className="actions" style={{ marginBottom: 12 }}>
          <input className="oy-input" name="q" defaultValue={q} placeholder="Ad, ürün kodu veya barkod" aria-label="Ara" style={{ maxWidth: 320 }} />
          <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">Ara</button>
        </form>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl" data-testid="warehouse-stock-table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th className="num">Adet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sku} data-testid={`ws-row-${r.sku}`}>
                  <td>
                    <Link href={`/admin/urunler/${r.productId}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                    <div className="muted">{r.sku}</div>
                  </td>
                  <td className="num" data-testid="qty">{r.quantity}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">Bu depoda stok yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {can(user, "warehouse.write") && (
        <section className="card">
          <h2>Depo bilgileri</h2>
          <ActionForm action={updateWarehouseAction.bind(null, w.id)} testId="warehouse-edit-form">
            <WarehouseFields
              v={{ code: w.code, name: w.name, address: w.address ?? "", sellsOnline: w.sellsOnline, isActive: w.isActive }}
              isDefault={w.isDefault}
            />
            <div className="actions">
              <button className="oy-btn oy-btn--primary" type="submit" data-testid="warehouse-edit-submit">Kaydet</button>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
