-- Faz 3 / P0-4: stok sayımı. YALNIZ EKLEME yapar.

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN "stockCountId" TEXT;

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "fullCount" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_number_key" ON "stock_counts"("number");
CREATE INDEX "stock_counts_warehouseId_status_idx" ON "stock_counts"("warehouseId", "status");
CREATE UNIQUE INDEX "stock_count_lines_stockCountId_inventoryId_key" ON "stock_count_lines"("stockCountId", "inventoryId");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sayılan adet negatif olamaz; bir depoda aynı anda yalnız bir açık / onay bekleyen sayım olabilir
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_check" CHECK ("countedQty" >= 0 AND "systemQty" >= 0);
CREATE UNIQUE INDEX "stock_counts_one_active_per_warehouse" ON "stock_counts"("warehouseId") WHERE "status" IN ('OPEN', 'SUBMITTED');
