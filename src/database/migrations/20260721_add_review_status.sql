-- =====================================================================
-- Migration: Moderasi Review — Sembunyikan/Tampilkan (UPDATE)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Menambahkan kolom `status` pada tabel reviews supaya Admin dapat
-- menyembunyikan review yang tidak pantas TANPA menghapusnya dari database.
--
-- - status = 'ditampilkan'   -> review tampil di Detail Produk, Review User,
--                               dan ikut dihitung dalam rata-rata rating.
-- - status = 'disembunyikan' -> review tetap tersimpan & tetap terlihat di
--                               halaman Review Admin, tapi tidak tampil di
--                               halaman manapun yang dilihat pengunjung/user,
--                               dan tidak ikut dihitung dalam rata-rata rating.
--
-- Default 'ditampilkan' supaya seluruh review yang sudah ada sebelum
-- migration ini tetap tampil seperti semula (tidak ada perubahan perilaku).
-- =====================================================================

alter table reviews
  add column if not exists status text not null default 'ditampilkan';

alter table reviews
  drop constraint if exists reviews_status_check;

alter table reviews
  add constraint reviews_status_check check (status in ('ditampilkan', 'disembunyikan'));

comment on column reviews.status is
  'Status moderasi review: ditampilkan (terlihat publik) atau disembunyikan (hanya terlihat di Review Admin).';

-- Mempercepat query publik (Detail Produk, rata-rata rating) yang selalu
-- memfilter berdasarkan status = ditampilkan.
create index if not exists reviews_status_idx on reviews (status);
