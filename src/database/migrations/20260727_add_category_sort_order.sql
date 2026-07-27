-- =====================================================================
-- Migration: Urutan Kategori (Category Ordering / Drag & Drop)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah data kategori yang sudah ada.
--
-- Menambahkan kolom sort_order pada tabel categories supaya Admin bisa
-- mengatur sendiri urutan kategori yang tampil di seluruh halaman website
-- (Home, Navbar, Dropdown Kategori, Halaman Semua Kategori, Halaman Produk),
-- menggantikan urutan alfabetis (nama_kategori) yang dipakai sebelumnya.
--
-- Konsepnya sama seperti sort_order pada tabel banners/hero_banners yang
-- sudah ada di project (lihat migrations/20260714_create_hero_banners.sql).
-- =====================================================================

alter table categories
  add column if not exists sort_order integer not null default 0;

comment on column categories.sort_order is 'Urutan tampil kategori di website, diatur Admin lewat drag & drop di Category Admin. Semakin kecil nilainya, semakin awal tampil.';

-- Backfill: kategori yang sudah ada diberi sort_order berurutan mengikuti
-- urutan lama (nama_kategori, lalu created_at) supaya tidak ada kategori
-- yang tiba-tiba "meloncat" ke depan/belakang sebelum Admin mengatur urutan
-- barunya sendiri lewat drag & drop.
with ranked as (
  select id, row_number() over (order by nama_kategori asc, created_at asc) - 1 as rn
  from categories
)
update categories
set sort_order = ranked.rn
from ranked
where categories.id = ranked.id
  and categories.sort_order = 0;

create index if not exists idx_categories_sort_order on categories(sort_order);
