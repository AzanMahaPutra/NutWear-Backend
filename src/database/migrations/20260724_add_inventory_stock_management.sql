-- =====================================================================
-- Migration: Halaman Inventory Stock Admin
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Kenapa perlu:
--   1. Riwayat Perubahan Stok butuh mencatat "Admin yang mengubah" dan
--      "Stok Lama"/"Stok Baru" secara eksplisit per baris log. Tabel
--      `stock_logs` yang sudah ada (lihat schema.sql) hanya menyimpan
--      quantity (selisih) + type, belum ada kolom admin & snapshot stok —
--      tiga kolom baru ditambahkan di bawah ini, NULLABLE supaya baris log
--      lama (mis. hasil pengurangan stok otomatis saat checkout, lihat
--      orderService.js) tetap valid tanpa perlu backfill.
--   2. Search Produk/SKU di halaman Inventory Stock (real-time, debounce,
--      dilakukan di backend/database sesuai dokumen permintaan) butuh index
--      trigram supaya ILIKE '%keyword%' tetap cepat walau produk sudah
--      ribuan. pg_trgm sudah pernah dibuat di migration
--      20260723_add_orders_search_index.sql — `create extension if not
--      exists` di sini aman/idempotent kalau dijalankan ulang.
--   3. Filter Status Stok (Aman/Menipis/Habis) di halaman Inventory Stock
--      memfilter berdasarkan kolom `product_variants.stok` — index b-tree
--      biasa sudah cukup untuk perbandingan (<=, >, =) dan dipakai juga
--      untuk ORDER BY stok pada query yang sama.
-- =====================================================================

create extension if not exists pg_trgm;

-- 1. Kolom audit tambahan pada stock_logs — lihat stockRepository.js (logStock).
alter table stock_logs add column if not exists admin_id uuid references users(id) on delete set null;
alter table stock_logs add column if not exists stok_sebelum integer;
alter table stock_logs add column if not exists stok_sesudah integer;

-- 2. Index trigram untuk search "Nama Produk" & "SKU Produk" di halaman Inventory Stock.
create index if not exists products_nama_produk_trgm_idx
  on products using gin (nama_produk gin_trgm_ops);

create index if not exists product_variants_sku_trgm_idx
  on product_variants using gin (sku gin_trgm_ops);

-- 3. Index untuk filter/urutan Status Stok (Aman/Menipis/Habis) & Quick Adjustment.
create index if not exists idx_product_variants_stok on product_variants(stok);
