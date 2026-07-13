-- =====================================================================
-- Migration: Tujuan produk (destination) untuk Banner
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah data yang sudah ada.
--
-- Menambahkan kolom product_id pada tabel banners agar admin bisa
-- memilih produk tujuan saat banner (Hero Banner) diklik oleh user.
-- Nullable — banner tetap valid tanpa produk tujuan (tidak ada aksi klik).
-- on delete set null: kalau produk dihapus, banner tidak ikut terhapus,
-- link-nya saja yang otomatis dikosongkan.
-- =====================================================================

alter table banners
  add column if not exists product_id uuid references products(id) on delete set null;

comment on column banners.product_id is 'Produk tujuan saat banner diklik user di Beranda (opsional). Dipilih admin lewat Banner Admin.';

create index if not exists idx_banners_product_id on banners(product_id);
