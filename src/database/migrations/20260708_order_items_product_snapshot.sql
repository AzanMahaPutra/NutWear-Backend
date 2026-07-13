-- =====================================================================
-- Migration: Snapshot data produk pada order_items + relasi FK yang aman
-- untuk penghapusan Produk/Variant (Update 3 — Halaman Pesanan Admin, poin 9).
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Masalah sebelumnya:
--   order_items.variant_id -> product_variants(id) TIDAK punya "on delete"
--   clause (default NO ACTION / RESTRICT), sehingga admin tidak bisa
--   menghapus Variant/Produk yang pernah dipesan.
--
-- Solusi:
--   1. Tambah kolom snapshot pada order_items (nama produk, slug, sku,
--      ukuran, warna, thumbnail) yang diisi saat checkout. Dengan begini
--      detail pesanan lama tetap utuh & bisa ditampilkan walau Produk/
--      Variant aslinya sudah dihapus.
--   2. Ubah order_items.variant_id menjadi nullable + ganti FK menjadi
--      ON DELETE SET NULL, supaya Variant boleh dihapus (riwayat order_item
--      tetap ada, hanya referensi live ke variant yang terputus, data
--      tampilan tetap dari kolom snapshot).
--   3. products & product_variants sudah "on delete cascade" ke
--      product_images/product_pairs/carts/wishlists/stock_logs — tidak
--      perlu diubah. Dengan variant_id di order_items sudah SET NULL,
--      penghapusan Produk (yang men-cascade ke product_variants) juga
--      otomatis tidak lagi terblokir.
-- =====================================================================

-- 1. Kolom snapshot produk pada order_items
alter table order_items
  add column if not exists product_name varchar(150),
  add column if not exists product_slug varchar(150),
  add column if not exists variant_sku varchar(50),
  add column if not exists variant_ukuran varchar(10),
  add column if not exists variant_warna varchar(50),
  add column if not exists image_url text;

comment on column order_items.product_name is 'Snapshot nama produk saat checkout — tetap tampil walau produk aslinya sudah dihapus admin.';
comment on column order_items.product_slug is 'Snapshot slug produk saat checkout, dipakai untuk link "Beli Lagi" bila produk masih ada.';
comment on column order_items.variant_sku is 'Snapshot SKU varian saat checkout.';
comment on column order_items.variant_ukuran is 'Snapshot ukuran varian saat checkout.';
comment on column order_items.variant_warna is 'Snapshot warna varian saat checkout.';
comment on column order_items.image_url is 'Snapshot thumbnail produk saat checkout.';

-- 2. Backfill data lama (selagi relasi variant/produk masih ada) supaya
--    riwayat pesanan yang sudah ada ikut punya data snapshot.
update order_items oi
set
  product_name = p.nama_produk,
  product_slug = p.slug,
  variant_sku = pv.sku,
  variant_ukuran = pv.ukuran,
  variant_warna = pv.warna,
  image_url = (
    select pi.image_url from product_images pi
    where pi.product_id = p.id
    order by pi.sort_order asc
    limit 1
  )
from product_variants pv
join products p on p.id = pv.product_id
where oi.variant_id = pv.id
  and oi.product_name is null;

-- 3. variant_id menjadi nullable + FK ON DELETE SET NULL (izinkan hapus Variant/Produk)
alter table order_items alter column variant_id drop not null;

alter table order_items drop constraint if exists order_items_variant_id_fkey;

alter table order_items
  add constraint order_items_variant_id_fkey
  foreign key (variant_id) references product_variants(id) on delete set null;
