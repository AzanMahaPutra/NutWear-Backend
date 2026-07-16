-- =====================================================================
-- Migration: Sistem Ulasan Produk berbasis Pesanan (UPDATE 7)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Perubahan konsep: ulasan tidak lagi bisa dibuat bebas dari Detail Produk.
-- Ulasan sekarang harus berasal dari sebuah pesanan (order) yang produknya
-- benar-benar pernah dibeli user tersebut dan berstatus "Selesai". Setiap
-- baris reviews karena itu perlu tahu ia berasal dari pesanan & item
-- pesanan yang mana.
--
-- - order_id  : pesanan yang menjadi sumber ulasan ini. Nullable supaya
--               ulasan lama (dibuat sebelum migration ini, tanpa data
--               pesanan) tetap valid & tetap tampil di Detail Produk,
--               hanya saja tanpa info pembelian (Ukuran/Warna/Jumlah).
-- - order_item_id : item pesanan spesifik yang dipakai sebagai sumber info
--               pembelian (nama produk, ukuran, warna, jumlah dibeli) yang
--               ditampilkan di Detail Produk. SET NULL kalau item pesanan
--               ikut terhapus (mis. pesanan dihapus admin) - ulasan tetap ada.
-- - Unique index (order_id, product_id) memastikan satu user hanya bisa
--   memberi SATU ulasan untuk satu produk pada satu pesanan yang sama
--   (constraint level database, selain validasi di reviewService).
-- =====================================================================

alter table reviews
  add column if not exists order_id uuid references orders(id) on delete cascade,
  add column if not exists order_item_id uuid references order_items(id) on delete set null;

comment on column reviews.order_id is 'Pesanan sumber ulasan ini. NULL untuk ulasan lama sebelum UPDATE 7.';
comment on column reviews.order_item_id is 'Item pesanan sumber info pembelian (ukuran/warna/jumlah) yang ditampilkan pada ulasan.';

-- Satu ulasan per produk per pesanan. Partial index (where order_id is not
-- null) supaya tidak mengganggu ulasan lama yang order_id-nya NULL.
create unique index if not exists reviews_order_product_unique
  on reviews (order_id, product_id)
  where order_id is not null;

create index if not exists reviews_order_id_idx on reviews (order_id);
