-- =====================================================================
-- UPDATE 6 — Tampilan Fitur Produk Direvisi (Hapus Judul Fitur)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali dan
-- tidak menghapus data yang sudah ada.
--
-- Fitur Produk sekarang hanya terdiri dari Gambar + Deskripsi (tanpa
-- Judul Fitur), baik di form Admin maupun tampilan Detail Produk (grid 2
-- kolom). Kolom `judul` pada tabel `product_features` sebelumnya wajib
-- diisi (NOT NULL) — migration ini melonggarkan constraint tersebut supaya
-- baris fitur baru bisa disimpan tanpa nilai judul.
--
-- Kolom `judul` SENGAJA TIDAK DIHAPUS supaya data fitur lama yang masih
-- menyimpan judul tetap aman di database. Baik API maupun frontend sudah
-- tidak lagi membaca/menampilkan nilai kolom ini.
-- =====================================================================

alter table product_features alter column judul drop not null;

comment on column product_features.judul is 'UPDATE 6: sudah tidak digunakan/ditampilkan lagi (Judul Fitur dihapus dari form Admin & tampilan Detail Produk). Kolom dipertahankan hanya untuk kompatibilitas data lama.';
