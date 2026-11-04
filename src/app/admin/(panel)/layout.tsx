import type { Metadata } from "next";
import Link from "next/link";
import AdminNav, { type NavItem } from "@/components/admin/AdminNav";
import { can, requireStaff } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { logoutAction } from "../giris/actions";

export const metadata: Metadata = { title: { default: "Yönetim", template: "%s – Yönetim" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV: (NavItem & { perm: Permission; any?: Permission[] })[] = [
  { href: "/admin", label: "Dashboard", group: "Genel", perm: "dashboard.view" },
  { href: "/admin/urunler", label: "Ürün yönetimi", group: "Katalog", perm: "product.read" },
  { href: "/admin/urunler/yeni", label: "Yeni ürün ekle", group: "Katalog", perm: "product.write" },
  { href: "/admin/urunler/ice-aktar", label: "Excel ile içe aktar", group: "Katalog", perm: "product.write" },
  { href: "/admin/kategoriler", label: "Kategori ve alt kategori", group: "Katalog", perm: "category.write" },
  { href: "/admin/markalar", label: "Markalar", group: "Katalog", perm: "brand.write" },
  { href: "/admin/fiyatlar", label: "Fiyat yönetimi", group: "Katalog", perm: "price.write" },
  { href: "/admin/stok", label: "Stok yönetimi", group: "Katalog", perm: "product.read" },
  { href: "/admin/depolar", label: "Depolar ve transfer", group: "Depo", perm: "product.read" },
  { href: "/admin/sayim", label: "Stok sayımı", group: "Depo", perm: "stockcount.write", any: ["stockcount.write", "stockcount.approve"] },
  { href: "/admin/tedarikciler", label: "Tedarikçiler", group: "Tedarik", perm: "supplier.write", any: ["supplier.write", "purchase.write", "purchase.approve", "purchase.receive"] },
  { href: "/admin/satin-alma", label: "Satın alma ve mal kabul", group: "Tedarik", perm: "purchase.write", any: ["supplier.write", "purchase.write", "purchase.approve", "purchase.receive"] },
  { href: "/admin/siparisler", label: "Siparişler", group: "Satış", perm: "order.read" },
  { href: "/admin/kargo", label: "Kargo yönetimi", group: "Satış", perm: "shipping.write" },
  { href: "/admin/musteriler", label: "Müşteriler", group: "Satış", perm: "customer.read" },
  { href: "/admin/kampanyalar", label: "Kampanyalar", group: "Satış", perm: "campaign.write" },
  { href: "/admin/icerik", label: "Site içerikleri", group: "Site", perm: "content.write" },
  { href: "/admin/guvenlik", label: "Hesap güvenliği (2FA)", group: "Hesabım", perm: "dashboard.view" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff(undefined, { allowWithoutMfa: true }); // zorunlu 2FA yönlendirmesi sayfa düzeyinde
  const items = NAV.filter((n) => (n.any ? n.any.some((p) => can(user, p)) : can(user, n.perm))).map(({ perm: _p, any: _a, ...n }) => n);
  return (
    <div className="adm">
      <aside className="adm-side">
        <Link href="/admin" className="adm-brand">
          <b>
            ÖNER<span style={{ color: "var(--orange-500)", font: "inherit", letterSpacing: 0, margin: 0 }}>.</span>
          </b>
          <span>YÖNETİM PANELİ</span>
        </Link>
        <AdminNav items={items} />
      </aside>
      <div className="adm-main">
        <header className="adm-top">
          <Link href="/" target="_blank" rel="noopener">
            Siteyi görüntüle ↗
          </Link>
          <div className="actions">
            <span data-testid="admin-user">
              {user.name} · <span className="muted">{user.roleName}</span>
            </span>
            <form action={logoutAction} className="inline-form">
              <button className="oy-btn oy-btn--outline oy-btn--sm" type="submit">
                Çıkış yap
              </button>
            </form>
          </div>
        </header>
        <main className="adm-content">{children}</main>
      </div>
    </div>
  );
}
