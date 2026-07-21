-- =====================================================================
-- Migration: Index pencarian Order ID (Search Order ID — halaman Pesanan Admin)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Kenapa perlu:
--   Search Bar "Cari berdasarkan Order ID..." mencocokkan sebagian/seluruh
--   Order ID secara case-insensitive (ILIKE '%keyword%') lewat orderRepository
--   (applySearch, dipakai GET /orders dan GET /orders/search-suggestions).
--   Kolom `orders.id` bertipe uuid — walau sudah jadi primary key, index
--   b-tree bawaan primary key TIDAK mempercepat pencarian ILIKE '%...%'
--   (partial match di tengah string). Extension pg_trgm + index GIN trigram
--   di bawah ini yang membuat pencarian tetap cepat walau jumlah pesanan
--   sudah sangat banyak.
-- =====================================================================

create extension if not exists pg_trgm;

-- Hapus index lama jika sempat terbuat (yang menggunakan ekspresi)
drop index if exists orders_id_text_trgm_idx;

-- Tambahkan computed column supaya Supabase PostgREST bisa mengenali tipenya sebagai text
alter table orders add column if not exists id_text text generated always as (id::text) stored;

-- Buat index di column baru
create index if not exists orders_id_text_trgm_idx
  on orders using gin (id_text gin_trgm_ops);
