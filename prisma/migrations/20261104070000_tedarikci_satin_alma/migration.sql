-- Faz 3 / P0-2,3: tedarikçi yönetimi, satın alma ve mal kabul. YALNIZ EKLEME yapar; mevcut veri değişmez.

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'PASSIVE', 'BLOCKED');
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED');
CREATE TYPE "ReceiptDocType" AS ENUM ('IRSALIYE', 'FATURA', 'IRSALIYELI_FATURA');

-- AlterTable (yeni, boş bırakılabilir kolonlar)
ALTER TABLE "products" ADD COLUMN "avgCost" DECIMAL(14,4);
ALTER TABLE "inventory_movements" ADD COLUMN "goodsReceiptId" TEXT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxOffice" TEXT,
    "taxNumber" TEXT,
    "productGroups" TEXT,
    "paymentTerms" TEXT,
    "avgLeadDays" INTEGER,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "minOrderQty" INTEGER NOT NULL DEFAULT 1,
    "leadDays" INTEGER,
    "supplierStock" INTEGER,
    "lastPurchaseAt" TIMESTAMP(3),
    "lastPurchasePrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedAt" TIMESTAMP(3),
    "note" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "supplierSku" TEXT,
    "quantity" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatRate" INTEGER NOT NULL,
    "lineNet" DECIMAL(14,2) NOT NULL,
    "lineVat" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "documentType" "ReceiptDocType" NOT NULL,
    "documentNo" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");
CREATE INDEX "supplier_products_productId_idx" ON "supplier_products"("productId");
CREATE UNIQUE INDEX "supplier_products_supplierId_productId_key" ON "supplier_products"("supplierId", "productId");
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");
CREATE INDEX "purchase_orders_status_createdAt_idx" ON "purchase_orders"("status", "createdAt");
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");
CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");
CREATE INDEX "purchase_order_items_productId_idx" ON "purchase_order_items"("productId");
CREATE UNIQUE INDEX "goods_receipts_number_key" ON "goods_receipts"("number");
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");
CREATE INDEX "goods_receipt_items_goodsReceiptId_idx" ON "goods_receipt_items"("goodsReceiptId");
CREATE INDEX "goods_receipt_items_purchaseOrderItemId_idx" ON "goods_receipt_items"("purchaseOrderItemId");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Veri bütünlüğü: kabul edilen adet sipariş edileni aşamaz, adetler ve fiyatlar pozitif
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_qty_check"
  CHECK ("quantity" > 0 AND "receivedQty" >= 0 AND "receivedQty" <= "quantity" AND "unitPrice" >= 0 AND "discountPct" >= 0 AND "discountPct" <= 100);
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_qty_check" CHECK ("quantity" > 0 AND "unitCost" >= 0);
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_values_check"
  CHECK ("purchasePrice" >= 0 AND "discountPct" >= 0 AND "discountPct" <= 100 AND "minOrderQty" >= 1);
