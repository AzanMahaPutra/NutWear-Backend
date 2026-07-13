-- =====================================================================
-- Migration: Harga Promo produk + label New Arrival
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah data yang sudah ada.
--
-- Kolom `harga` pada tabel products tetap dipakai sebagai "Harga Normal"
-- (tidak ada perubahan nama/tipe), sesuai dengan konsep Harga Normal +
-- Harga Promo yang sudah dipakai di Banner.
-- =====================================================================

alter table products
  add column if not exists harga_promo integer,
  add column if not exists harga_promo_color varchar(20) not null default '#dc2626',
  add column if not exists is_new_arrival boolean not null default false;

comment on column products.harga_promo is 'Harga promo (opsional). Jika diisi, frontend menampilkan Harga Normal dengan strikethrough dan Harga Promo lebih menonjol.';
comment on column products.harga_promo_color is 'Warna teks Harga Promo (hex), dipilih admin lewat color picker seperti pada Banner. Default merah.';
comment on column products.is_new_arrival is 'Status New Arrival, dikontrol admin di halaman Edit Produk. Dipakai untuk badge & filter "New Arrival" di halaman produk (user).';

create index if not exists idx_products_is_new_arrival on products(is_new_arrival);
