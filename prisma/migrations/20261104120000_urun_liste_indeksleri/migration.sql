-- Performans: ürün listeleri "en yeniler", "çok satanlar" ve ana sayfa sıralamaları için indeksler. YALNIZ EKLEME.
CREATE INDEX "products_createdAt_idx" ON "products"("createdAt");
CREATE INDEX "products_soldCount_idx" ON "products"("soldCount");
CREATE INDEX "products_updatedAt_idx" ON "products"("updatedAt");
