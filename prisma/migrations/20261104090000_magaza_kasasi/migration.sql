-- Faz 3 / P1: mağaza kasası (fiziksel satış, iptal, iade). YALNIZ EKLEME yapar.

-- CreateEnum
CREATE TYPE "StoreSaleStatus" AS ENUM ('COMPLETED', 'CANCELLED');
CREATE TYPE "StorePayMethod" AS ENUM ('CASH', 'CARD');

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN "storeSaleId" TEXT;

-- CreateTable
CREATE TABLE "store_sales" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "StoreSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "customerId" TEXT,
    "customerName" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "vatTotal" DECIMAL(14,2) NOT NULL,
    "refundedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "documentNo" TEXT,
    "note" TEXT,
    "cashierId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_sale_items" (
    "id" TEXT NOT NULL,
    "storeSaleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatRate" INTEGER NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "store_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_payments" (
    "id" TEXT NOT NULL,
    "storeSaleId" TEXT NOT NULL,
    "method" "StorePayMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_returns" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "storeSaleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "cashierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_return_items" (
    "id" TEXT NOT NULL,
    "storeReturnId" TEXT NOT NULL,
    "storeSaleItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "restocked" BOOLEAN NOT NULL,

    CONSTRAINT "store_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_sales_number_key" ON "store_sales"("number");
CREATE INDEX "store_sales_createdAt_idx" ON "store_sales"("createdAt");
CREATE INDEX "store_sales_status_createdAt_idx" ON "store_sales"("status", "createdAt");
CREATE INDEX "store_sale_items_storeSaleId_idx" ON "store_sale_items"("storeSaleId");
CREATE INDEX "store_sale_items_productId_idx" ON "store_sale_items"("productId");
CREATE INDEX "store_payments_storeSaleId_idx" ON "store_payments"("storeSaleId");
CREATE UNIQUE INDEX "store_returns_number_key" ON "store_returns"("number");
CREATE INDEX "store_returns_storeSaleId_idx" ON "store_returns"("storeSaleId");
CREATE INDEX "store_return_items_storeReturnId_idx" ON "store_return_items"("storeReturnId");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_storeSaleId_fkey" FOREIGN KEY ("storeSaleId") REFERENCES "store_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "store_sales" ADD CONSTRAINT "store_sales_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_sales" ADD CONSTRAINT "store_sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "store_sale_items" ADD CONSTRAINT "store_sale_items_storeSaleId_fkey" FOREIGN KEY ("storeSaleId") REFERENCES "store_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_sale_items" ADD CONSTRAINT "store_sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_payments" ADD CONSTRAINT "store_payments_storeSaleId_fkey" FOREIGN KEY ("storeSaleId") REFERENCES "store_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_returns" ADD CONSTRAINT "store_returns_storeSaleId_fkey" FOREIGN KEY ("storeSaleId") REFERENCES "store_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_return_items" ADD CONSTRAINT "store_return_items_storeReturnId_fkey" FOREIGN KEY ("storeReturnId") REFERENCES "store_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_return_items" ADD CONSTRAINT "store_return_items_storeSaleItemId_fkey" FOREIGN KEY ("storeSaleItemId") REFERENCES "store_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bütünlük: adetler pozitif, iade satılandan fazla olamaz, indirim satır tutarını aşamaz
ALTER TABLE "store_sale_items" ADD CONSTRAINT "store_sale_items_values_check"
  CHECK ("quantity" > 0 AND "returnedQty" >= 0 AND "returnedQty" <= "quantity" AND "discount" >= 0 AND "lineTotal" >= 0);
ALTER TABLE "store_return_items" ADD CONSTRAINT "store_return_items_qty_check" CHECK ("quantity" > 0 AND "amount" >= 0);
