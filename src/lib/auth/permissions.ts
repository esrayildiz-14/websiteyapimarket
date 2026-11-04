// Yetki anahtarları ve rollerin varsayılan yetkileri. Seed ve arayüz aynı listeyi kullanır.

export const PERMISSIONS = {
  "dashboard.view": "Panoyu görüntüleme",
  "product.read": "Ürünleri görüntüleme",
  "product.write": "Ürün ekleme / düzenleme / silme",
  "product.purchase_price": "Alış fiyatını görme ve değiştirme",
  "price.write": "Fiyat ve indirimli fiyat değiştirme",
  "category.write": "Kategori ve alt kategori yönetimi",
  "brand.write": "Marka yönetimi",
  "stock.write": "Stok girişi ve düzeltme",
  "warehouse.write": "Depo tanımlama, depolar arası transfer, mal çıkışı / hasar / fire",
  "supplier.write": "Tedarikçi kartları ve tedarikçi ürün fiyatları",
  "purchase.write": "Satın alma siparişi oluşturma ve düzenleme",
  "purchase.approve": "Satın alma siparişini onaylama",
  "purchase.receive": "Mal kabul (stok girişi)",
  "stockcount.write": "Stok sayımı başlatma ve ürün okutma",
  "stockcount.approve": "Stok sayımını onaylama (stok düzeltmesi)",
  "pos.sell": "Mağaza kasası: barkodla satış",
  "pos.refund": "Mağaza kasası: satış iptali ve iade",
  "finance.view": "Satış, maliyet ve kârlılık raporları",
  "order.read": "Siparişleri görüntüleme",
  "order.update": "Sipariş durumu ve kargo takip no",
  "order.refund": "İptal ve iade",
  "shipping.write": "Kargo firmaları, profilleri ve ücretleri",
  "customer.read": "Müşterileri görüntüleme",
  "campaign.write": "Kampanya ve kupon yönetimi",
  "content.write": "Banner, sayfa ve SSS yönetimi",
  "user.manage": "Admin kullanıcılarını yönetme",
  "audit.view": "Denetim kayıtlarını görme",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLES: { key: string; name: string; permissions: Permission[] | "ALL" }[] = [
  { key: "SUPER_ADMIN", name: "Super Admin", permissions: "ALL" },
  {
    key: "ADMIN",
    name: "Admin",
    permissions: [
      "dashboard.view", "product.read", "product.write", "product.purchase_price", "price.write", "category.write",
      "brand.write", "stock.write", "warehouse.write", "supplier.write", "purchase.write", "purchase.approve", "purchase.receive", "stockcount.write", "stockcount.approve", "pos.sell", "pos.refund", "finance.view", "order.read", "order.update", "order.refund", "shipping.write", "customer.read",
      "campaign.write", "content.write", "audit.view",
    ],
  },
  {
    key: "PRODUCT_MANAGER",
    name: "Ürün Yöneticisi",
    permissions: ["dashboard.view", "product.read", "product.write", "price.write", "category.write", "brand.write", "stock.write", "warehouse.write", "supplier.write", "purchase.write", "purchase.receive", "stockcount.write"],
  },
  {
    key: "WAREHOUSE_STAFF",
    name: "Depo Personeli",
    permissions: ["dashboard.view", "product.read", "stock.write", "warehouse.write", "stockcount.write", "purchase.receive"],
  },
  {
    key: "PURCHASING_STAFF",
    name: "Satın Alma Personeli",
    permissions: ["dashboard.view", "product.read", "product.purchase_price", "supplier.write", "purchase.write"],
  },
  {
    key: "FINANCE_STAFF",
    name: "Finans Personeli",
    permissions: ["dashboard.view", "product.read", "product.purchase_price", "order.read", "finance.view", "purchase.approve"],
  },
  {
    key: "CUSTOMER_SERVICE",
    name: "Müşteri Hizmetleri",
    permissions: ["dashboard.view", "product.read", "order.read", "order.update", "customer.read"],
  },
  {
    key: "STORE_STAFF",
    name: "Mağaza Satış Personeli",
    permissions: ["dashboard.view", "product.read", "pos.sell"],
  },
  {
    key: "ORDER_STAFF",
    name: "Sipariş Personeli",
    permissions: ["dashboard.view", "product.read", "order.read", "order.update"],
  },
];
