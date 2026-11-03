import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, requireStaff } from "@/lib/auth/session";
import ActionForm from "@/components/admin/ActionForm";
import Flash from "@/components/admin/Flash";
import { ISSUE_KINDS, stockMismatches } from "@/server/warehouse-admin";
import { MOVEMENT_LABEL } from "@/lib/movement";
import WarehouseFields from "./WarehouseFields";
import { createWarehouseAction, issueAction, transferAction } from "./actions";

export const metadata = { title: "Depolar" };
type SP = Promise<Record<string, string | string[] | undefined>>;


export default async function WarehousesPage({ searchParams }: { searchParams: SP }) {
  const user = await requireStaff("product.read");
  const sp = await searchParams;
  const write = can(user, "warehouse.write");
  const [warehouses, totals, mismatches, movements] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.$queryRaw<{ warehouseId: string; units: number; items: number }[]>`
      SELECT "warehouseId", COALESCE(SUM(quantity), 0)::int AS units, COUNT(*) FILTER (WHERE quantity > 0)::int AS items
      FROM warehouse_stocks GROUP BY "warehouseId"`,
    stockMismatches(),
    prisma.inventoryMovement.findMany({
      where: { type: { in: ["TRANSFER_OUT", "TRANSFER_IN", "ISSUE_OUT", "DAMAGE_OUT", "WASTE_OUT"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { product: true, variant: true, user: true, warehouse: true },
    }),
  ]);
  const t = Object.fromEntries(totals.map((x) => [x.warehouseId, x]));
  const active = warehouses.filter((w) => w.isActive);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Depolar</h1>
          <p>Sitede satılabilir stok = online satışa açık depoların toplamı − ödeme bekleyen siparişlere ayrılan adet.</p>
        </div>
      </div>
      <Flash sp={sp} />
      {mismatches.length > 0 && (
        <div className="flash warn" role="alert" data-testid="stock-mismatch">
          {mismatches.length} üründe satılabilir stok ile depo toplamı uyuşmuyor. Sayım ile düzeltin.
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl" data-testid="warehouse-table">
          <thead>
            <tr>
              <th>Depo</th>
              <th>Online satış</th>
              <th className="num">Çeşit</th>
              <th className="num">Toplam adet</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id} data-testid={`warehouse-row-${w.code}`}>
                <td>
                  <Link href={`/admin/depolar/${w.id}`} style={{ fontWeight: 600 }}>
                    {w.name}
                  </Link>
                  <div className="muted">
                    {w.code}
                    {w.isDefault ? " · varsayılan" : ""}
                  </div>
                </td>
                <td>
                  <span className={`pill ${w.sellsOnline ? "on" : "off"}`}>{w.sellsOnline ? "Açık" : "Kapalı"}</span>
                </td>
                <td className="num">{t[w.id]?.items ?? 0}</td>
                <td className="num" data-testid="units">
                  {t[w.id]?.units ?? 0}
                </td>
                <td>
                  <span className={`pill ${w.isActive ? "on" : "off"}`}>{w.isActive ? "Aktif" : "Pasif"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {write && (
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <section className="card">
            <h2>Depolar arası transfer</h2>
            <form action={transferAction} className="form-grid" data-testid="transfer-form">
              <label className="oy-field full">
                <span className="oy-field__label req">Ürün kodu veya barkod</span>
                <input className="oy-input" name="code" required autoComplete="off" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Kaynak depo</span>
                <select className="oy-select" name="fromId" required defaultValue="">
                  <option value="" disabled>Seçin</option>
                  {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Hedef depo</span>
                <select className="oy-select" name="toId" required defaultValue="">
                  <option value="" disabled>Seçin</option>
                  {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Miktar</span>
                <input className="oy-input" name="quantity" type="number" min={1} step={1} required />
              </label>
              <label className="oy-field">
                <span className="oy-field__label">Açıklama</span>
                <input className="oy-input" name="note" maxLength={300} />
              </label>
              <div className="actions full">
                <button className="oy-btn oy-btn--primary" type="submit" data-testid="transfer-submit">Transfer et</button>
              </div>
            </form>
          </section>

          <section className="card">
            <h2>Mal çıkışı / hasar / fire</h2>
            <form action={issueAction} className="form-grid" data-testid="issue-form">
              <label className="oy-field full">
                <span className="oy-field__label req">Ürün kodu veya barkod</span>
                <input className="oy-input" name="code" required autoComplete="off" />
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Depo</span>
                <select className="oy-select" name="warehouseId" required defaultValue={active.find((w) => w.isDefault)?.id ?? ""}>
                  {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Tür</span>
                <select className="oy-select" name="kind" defaultValue="DAMAGE_OUT">
                  {Object.entries(ISSUE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Miktar</span>
                <input className="oy-input" name="quantity" type="number" min={1} step={1} required />
              </label>
              <label className="oy-field">
                <span className="oy-field__label req">Neden / açıklama</span>
                <input className="oy-input" name="note" minLength={3} maxLength={300} required />
              </label>
              <div className="actions full">
                <button className="oy-btn oy-btn--primary" type="submit" data-testid="issue-submit">Çıkışı kaydet</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="card">
        <h2>Son transfer ve çıkış hareketleri</h2>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl" data-testid="warehouse-movements">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Depo</th>
                <th>Ürün</th>
                <th>Hareket</th>
                <th className="num">Miktar</th>
                <th className="num">Depoda kalan</th>
                <th>Açıklama</th>
                <th>Kullanıcı</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.createdAt.toLocaleString("tr-TR")}</td>
                  <td>{m.warehouse?.name ?? "—"}</td>
                  <td>
                    {m.product.name}
                    {m.variant ? ` · ${m.variant.name}` : ""}
                  </td>
                  <td>{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                  <td className="num">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                  <td className="num">{m.stockAfter}</td>
                  <td className="muted">{m.note ?? ""}</td>
                  <td className="muted">{m.user ? `${m.user.firstName} ${m.user.lastName}` : "Sistem"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {write && (
        <section className="card">
          <h2>Yeni depo ekle</h2>
          <ActionForm action={createWarehouseAction} testId="warehouse-form">
            <WarehouseFields v={{ code: "", name: "", address: "", sellsOnline: false, isActive: true }} />
            <div className="actions">
              <button className="oy-btn oy-btn--primary" type="submit" data-testid="warehouse-submit">Depoyu kaydet</button>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
