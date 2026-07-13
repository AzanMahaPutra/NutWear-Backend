-- =====================================================================
-- UPDATE 4 — Penambahan Gambar pada Fitur Produk
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah/menghapus data yang sudah ada.
--
-- Sebelumnya admin hanya bisa mengisi Fitur lewat teks bebas (field
-- `deskripsi` produk, ditampilkan apa adanya di accordion "Fitur" pada
-- Detail Produk). Sekarang satu produk bisa punya banyak baris Fitur
-- Produk, masing-masing dengan gambar pendukung + judul + deskripsi
-- sendiri, disimpan di tabel baru `product_features`.
--
-- Produk lama yang belum punya baris di `product_features` tetap tampil
-- normal — frontend fallback ke teks `deskripsi` seperti sebelumnya,
-- jadi migration ini tidak menyebabkan error pada data lama.
-- =====================================================================

create table if not exists product_features (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  image_url text not null,
  image_path text, -- path di Supabase Storage, dipakai untuk hapus/ganti gambar (sama pola dengan product_images)
  judul varchar(150) not null,
  deskripsi text not null,
  sort_order integer not null default 0,
  created_at timestamp not null default now()
);

comment on table product_features is 'Fitur Produk (UPDATE 4) — setiap baris = satu fitur dengan gambar, judul, dan deskripsi sendiri. Ditampilkan pada accordion "Fitur" di halaman Detail Produk (layout dua kolom: gambar kiri, judul+deskripsi kanan).';
comment on column product_features.image_path is 'Path file di Supabase Storage bucket nutwear-assets, dipakai saat hapus/ganti gambar fitur.';
comment on column product_features.sort_order is 'Urutan tampil fitur (naik/turun diatur admin lewat tombol urutan).';

create index if not exists idx_product_features_product_id on product_features(product_id);
