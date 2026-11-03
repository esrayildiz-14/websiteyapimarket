-- Faz 3 / P0-1: Depo altyapısı. YALNIZ EKLEME yapar; mevcut tablo, kolon veya veri silinmez.
-- Mevcut stoklar "Merkez Depo"ya KOPYALANIR; inventory.quantity (online satılabilir stok) değişmez.

-- Yeni stok hareket türleri
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'ISSUE_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'DAMAGE_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'WASTE_OUT';

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "sellsOnline" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_stocks" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_stocks_pkey" PRIMARY KEY ("id")
);

-- AlterTable (yeni, boş bırakılabilir kolon)
ALTER TABLE "inventory_movements" ADD COLUMN "warehouseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");
CREATE INDEX "warehouse_stocks_inventoryId_idx" ON "warehouse_stocks"("inventoryId");
CREATE UNIQUE INDEX "warehouse_stocks_warehouseId_inventoryId_key" ON "warehouse_stocks"("warehouseId", "inventoryId");

-- AddForeignKey
ALTER TABLE "warehouse_stocks" ADD CONSTRAINT "warehouse_stocks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warehouse_stocks" ADD CONSTRAINT "warehouse_stocks_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Depo stoğu eksiye düşemez; yalnız bir varsayılan depo olabilir
ALTER TABLE "warehouse_stocks" ADD CONSTRAINT "warehouse_stocks_nonnegative_check" CHECK ("quantity" >= 0);
CREATE UNIQUE INDEX "warehouses_single_default" ON "warehouses"("isDefault") WHERE "isDefault";

-- Varsayılan depo ve mevcut stokların kopyası
INSERT INTO "warehouses" ("id", "code", "name", "sellsOnline", "isDefault", "isActive", "sortOrder", "updatedAt")
VALUES ('wh_merkez', 'MERKEZ', 'Merkez Depo', true, true, true, 0, now());

INSERT INTO "warehouse_stocks" ("id", "warehouseId", "inventoryId", "quantity", "updatedAt")
SELECT 'ws_' || i."id", 'wh_merkez', i."id", i."quantity", now() FROM "inventory" i;
