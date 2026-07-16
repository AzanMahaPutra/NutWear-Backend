-- =====================================================================
-- Migration: Tambah kolom product_id pada order_items
-- (UPDATE 7 — Perbaikan Sistem Ulasan Produk berbasis Pesanan)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Kenapa perlu:
--   order_items sebelumnya hanya menyimpan variant_id (nullable, SET NULL
--   kalau Variant/Produk dihapus admin) tanpa menyimpan product_id secara
--   langsung. Fitur ulasan berbasis pesanan butuh referensi product_id yang
--   stabil per item pesanan (untuk validasi "produk ini benar-benar dibeli
--   pada pesanan ini" & untuk relasi reviews.order_item_id -> order_items),
--   yang harus tetap ada walau variant_id belakangan menjadi NULL.
-- =====================================================================

alter table order_items
  add column if not exists product_id uuid references products(id) on delete set null;

comment on column order_items.product_id is 'Snapshot product_id saat checkout — independen dari variant_id (bisa NULL setelah Variant dihapus). Dipakai untuk validasi Sistem Ulasan Produk berbasis Pesanan.';

-- Backfill data lama dari relasi variant_id -> product_variants.product_id,
-- selagi relasinya masih ada.
update order_items oi
set product_id = pv.product_id
from product_variants pv
where oi.variant_id = pv.id
  and oi.product_id is null;

create index if not exists order_items_product_id_idx on order_items (product_id);
