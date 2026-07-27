-- =====================================================================
-- BUG FIX — Section "Produk Rekomendasi" menampilkan seluruh produk
-- =====================================================================
-- Section Produk Rekomendasi di Beranda sebelumnya tidak punya flag apa pun
-- di database untuk menandai produk mana yang direkomendasikan (lihat catatan
-- lama di frontend/app/(shop)/page.tsx: "Produk Rekomendasi untuk saat ini
-- menampilkan katalog yang sama"). Migration ini menambahkan kolom
-- `is_recommended` ke tabel `products`, mengikuti pola persis yang sudah ada
-- untuk `is_new_arrival` (migrations/20260708_add_product_promo_price_and_new_arrival.sql),
-- supaya Admin bisa menandai produk sebagai Produk Rekomendasi lewat Form
-- Tambah/Edit Produk, dan Beranda bisa memfilter berdasarkan flag ini.
-- =====================================================================

alter table products
  add column if not exists is_recommended boolean not null default false;

comment on column products.is_recommended is 'Flag Produk Rekomendasi — dipakai section "Produk Rekomendasi" di Beranda (hanya menampilkan produk dengan nilai true).';

create index if not exists idx_products_is_recommended on products(is_recommended);
