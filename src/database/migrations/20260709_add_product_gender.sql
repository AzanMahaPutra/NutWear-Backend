-- =====================================================================
-- Migration: Gender Produk (Pria / Wanita / Uniseks)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah data yang sudah ada.
--
-- Menambahkan kolom gender pada tabel products. Dipilih admin lewat
-- dropdown wajib di halaman Admin Product (tambah/edit produk), dan
-- ditampilkan di seluruh Card Produk di website (bersama rentang ukuran
-- yang dihitung dari product_variants).
-- Default 'uniseks' dipakai hanya supaya produk lama (sebelum migration
-- ini) tetap valid; produk baru wajib mengisi gender lewat form Admin.
-- =====================================================================

alter table products
  add column if not exists gender varchar(10) not null default 'uniseks';

alter table products
  drop constraint if exists products_gender_check;

alter table products
  add constraint products_gender_check check (gender in ('pria', 'wanita', 'uniseks'));

comment on column products.gender is 'Target gender produk: pria, wanita, atau uniseks. Wajib dipilih admin di form Produk, ditampilkan pada seluruh Card Produk.';

create index if not exists idx_products_gender on products(gender);
