import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, requireStaff } from "@/lib/auth/session";
import { toInputMoney, formatTL } from "@/lib/money";
import Flash from "@/components/admin/Flash";
import ProductForm, { type ProductFormValues } from "@/components/admin/ProductForm";
import { productFormOptions } from "@/server/form-data";
import {
  coverImageAction, deleteImageAction, deleteProductAction, duplicateProductAction, restoreProductAction, setStatusAction, updateProductAction,
} from "../actions";

export const metadata = { title: "Ürün düzenle" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EditProductPage({ params, searchParams }: Props) {
  const user = await requireStaff("product.read");
  const { id } = await params;
  const sp = await searchParams;
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      inventory: true,
      images: { orderBy: { sortOrder: "asc" } },
      inventoryMovements: { orderBy: { createdAt: "desc" }, take: 5 },
      priceHistory: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!p) notFound();
  const options = await productFormOptions();
  const write = can(user, "product.write") && !p.deletedAt;
  const isSub = !!p.category.parentId;
  const specs = Array.isArray(p.specs) ? (p.specs as { label: string; value: string }[]) : [];
  const dec = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

  const initial: ProductFormValues = {
    name: p.name, sku: p.sku, barcode: p.barcode ?? "",
    mainCategoryId: isSub ? p.category.parentId! : p.categoryId, subCategoryId: isSub ? p.categoryId : "",
    brandId: p.brandId ?? "", model: p.model ?? "", freeShipping: p.freeShipping, shortDescription: p.shortDescription ?? "", description: p.description ?? "",
    specs: specs.length ? specs : [{ label: "", value: "" }],
    price: toInputMoney(p.price), salePrice: toInputMoney(p.salePrice), purchasePrice: can(user, "product.purchase_price") ? toInputMoney(p.purchasePrice) : "",
    vatRate: String(p.vatRate), stock: String(p.inventory?.quantity ?? 0), minStock: String(p.inventory?.minStock ?? 0), saleUnit: p.saleUnit,
    weightKg: dec(p.weightKg), widthCm: dec(p.widthCm), heightCm: dec(p.heightCm), lengthCm: dec(p.lengthCm),
    shippingProfileId: p.shippingProfileId, handlingDays: String(p.handlingDays), status: p.status, isFeatured: p.isFeatured,
    seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{p.name}</h1>
          <p>
            {p.sku} ·{" "}
            {p.deletedAt ? (
              <span className="pill err">Silindi</span>
            ) : (
              <span className={`pill ${p.status === "ACTIVE" ? "on" : "off"}`} data-testid="product-status">
                {p.status === "ACTIVE" ? "Aktif" : "Pasif"}
              </span>
            )}{" "}
            {p.status === "ACTIVE" && !p.deletedAt && (
              <Link href={`/urun/${p.slug}`} target="_blank">
                Sitede görüntüle ↗
              </Link>
            )}
          </p>
        </div>
        <div className="actions">
          <Link href="/admin/urunler">‹ Ürün listesi</Link>
          {write && (
            <>
              <form action={setStatusAction} className="inline-form">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="status" value={p.status === "ACTIVE" ? "PASSIVE" : "ACTIVE"} />
                <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">
                  {p.status === "ACTIVE" ? "Yayından kaldır" : "Yayına al"}
                </button>
              </form>
              <form action={duplicateProductAction} className="inline-form">
                <input type="hidden" name="id" value={p.id} />
                <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">
                  Kopyala
                </button>
              </form>
              <form action={deleteProductAction} className="inline-form">
                <input type="hidden" name="id" value={p.id} />
                <button className="oy-btn oy-btn--sm" type="submit" style={{ background: "var(--danger)", color: "#fff" }}>
                  Ürünü sil
                </button>
              </form>
            </>
          )}
          {p.deletedAt && can(user, "product.write") && (
            <form action={restoreProductAction} className="inline-form">
              <input type="hidden" name="id" value={p.id} />
              <button className="oy-btn oy-btn--secondary oy-btn--sm" type="submit">
                Geri al
              </button>
            </form>
          )}
        </div>
      </div>
      <Flash sp={sp} />

      {p.images.length > 0 && (
        <section className="card">
          <h2>Mevcut fotoğraflar</h2>
          <div className="img-grid">
            {p.images.map((img, i) => (
              <div className="img-tile" key={img.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt ?? ""} />
                <div>
                  {i === 0 ? (
                    <b>Kapak</b>
                  ) : write ? (
                    <form action={coverImageAction} className="inline-form">
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button className="link-btn" type="submit" style={{ fontSize: 12 }}>
                        Kapak yap
                      </button>
                    </form>
                  ) : (
                    <span>#{i + 1}</span>
                  )}
                  {write && (
                    <form action={deleteImageAction} className="inline-form">
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button className="danger-link" type="submit" style={{ fontSize: 12 }}>
                        Sil
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {write ? (
        <ProductForm
          options={options}
          initial={initial}
          action={updateProductAction.bind(null, p.id)}
          submitLabel="Değişiklikleri kaydet"
          canSeePurchasePrice={can(user, "product.purchase_price")}
          existingImageCount={p.images.length}
        />
      ) : (
        <div className="flash warn">{p.deletedAt ? "Silinmiş ürün düzenlenemez; önce geri alın." : "Bu ürünü düzenleme yetkiniz yok."}</div>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>Son stok hareketleri</h2>
          {p.inventoryMovements.length === 0 ? (
            <p className="muted">Hareket yok.</p>
          ) : (
            <table className="tbl">
              <tbody>
                {p.inventoryMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="muted">{m.createdAt.toLocaleString("tr-TR")}</td>
                    <td>{m.note ?? m.type}</td>
                    <td className="num">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="num muted">→ {m.stockAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2>Fiyat geçmişi</h2>
          <table className="tbl">
            <tbody>
              {p.priceHistory.map((h) => (
                <tr key={h.id}>
                  <td className="muted">{h.createdAt.toLocaleString("tr-TR")}</td>
                  <td className="num">{formatTL(h.price)}</td>
                  <td className="num">{h.salePrice ? formatTL(h.salePrice) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
