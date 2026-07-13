-- =====================================================================
-- UPDATE 3 — Penyempurnaan Sistem Pasangan Produk (per Foto Gallery)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah/menghapus data yang sudah ada.
--
-- Sebelumnya pasangan produk (`product_pairs`) hanya berelasi pada level
-- Produk (product_id <-> paired_product_id). Sekarang setiap FOTO pada
-- Gallery Produk (baik "foto utama per warna" maupun "foto galeri umum" —
-- keduanya baris pada tabel `product_images`) bisa punya pasangan produknya
-- masing-masing, lewat tabel baru `product_image_pairs`.
--
-- Tabel `product_pairs` (relasi lama, level Produk) TIDAK dihapus maupun
-- diubah supaya data yang sudah ada tetap aman & tidak ada breaking change
-- pada relasi lama. Fitur Pasangan Produk di Admin & halaman Detail Produk
-- sekarang memakai `product_image_pairs`.
-- =====================================================================

create table if not exists product_image_pairs (
  id uuid primary key default uuid_generate_v4(),
  image_id uuid not null references product_images(id) on delete cascade,
  paired_product_id uuid not null references products(id) on delete cascade,
  created_at timestamp not null default now(),
  unique (image_id, paired_product_id)
);

comment on table product_image_pairs is 'Relasi Pasangan Produk per foto Gallery Produk (product_images). Satu foto bisa punya banyak pasangan produk. Menggantikan penggunaan product_pairs (relasi lama level Produk, tetap dipertahankan untuk kompatibilitas data lama).';
comment on column product_image_pairs.image_id is 'Foto gallery (product_images.id) yang dipasangkan — bisa foto utama per warna maupun foto galeri umum.';
comment on column product_image_pairs.paired_product_id is 'Produk pasangan yang ditampilkan di halaman Pasangan Produk.';

create index if not exists idx_product_image_pairs_image_id on product_image_pairs(image_id);
create index if not exists idx_product_image_pairs_paired_product_id on product_image_pairs(paired_product_id);
