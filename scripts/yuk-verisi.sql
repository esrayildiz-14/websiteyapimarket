-- Yük testi için TEST veritabanına sentetik ürün ekler (gerçek veritabanında ÇALIŞTIRILMAZ).
-- psql -v adet=10000 -f scripts/yuk-verisi.sql
INSERT INTO products (id, name, slug, sku, "categoryId", price, "vatRate", "saleUnit", "weightKg", "widthCm", "heightCm", "lengthCm", "shippingProfileId", status, "soldCount", "createdAt", "updatedAt")
SELECT 'yuk' || g || '-' || :'tur', 'Yük testi ürünü ' || g || ' vida matkap boya', 'yuk-' || :'tur' || '-' || g, 'YUK-' || :'tur' || '-' || g,
       (SELECT id FROM categories WHERE "parentId" IS NOT NULL ORDER BY "sortOrder" OFFSET (g % 50) LIMIT 1),
       10 + (g % 900), 20, 'ADET', 1, 10, 10, 10, (SELECT id FROM shipping_profiles WHERE code = 'STD'), 'ACTIVE', g % 37, now(), now()
FROM generate_series(1, :adet) g;
INSERT INTO inventory (id, "productId", quantity, reserved, "minStock", "updatedAt")
SELECT 'inv' || p.id, p.id, 10 + (random() * 50)::int, 0, 0, now() FROM products p WHERE p.id LIKE 'yuk%-' || :'tur' ON CONFLICT DO NOTHING;
ANALYZE;
