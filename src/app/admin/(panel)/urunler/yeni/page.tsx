import Link from "next/link";
import { can, requireStaff } from "@/lib/auth/session";
import { productFormOptions } from "@/server/form-data";
import ProductForm, { EMPTY_PRODUCT } from "@/components/admin/ProductForm";
import { createProductAction } from "../actions";

export const metadata = { title: "Yeni ürün" };

export default async function NewProductPage() {
  const user = await requireStaff("product.write");
  const options = await productFormOptions();
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Yeni ürün ekle</h1>
          <p>Yıldızlı alanlar zorunlu. Ürünü pasif kaydedip sonra yayına alabilirsiniz.</p>
        </div>
        <Link href="/admin/urunler">‹ Ürün listesi</Link>
      </div>
      <ProductForm
        options={options}
        initial={EMPTY_PRODUCT}
        action={createProductAction}
        submitLabel="Ürünü kaydet"
        canSeePurchasePrice={can(user, "product.purchase_price")}
      />
    </>
  );
}
