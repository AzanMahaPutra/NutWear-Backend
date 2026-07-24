-- =====================================================================
-- Migration: Perbaikan data Harga Promo yang tersimpan sebagai 0
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Latar belakang:
-- Bug lama di form Admin Produk (ProductForm.tsx) membuat field Harga
-- Promo yang sengaja dikosongkan Admin ikut tersimpan sebagai angka 0,
-- bukan NULL (lihat CHANGELOG.md untuk detail penyebab). Akibatnya
-- produk yang dibuat/diedit SEBELUM fix ini tetap punya harga_promo = 0
-- di database, sehingga website masih menampilkan produk itu sebagai
-- sedang promo (harga dicoret + Rp0) walau Admin tidak pernah mengisi
-- promo untuk produk tersebut.
--
-- Migration ini membersihkan data lama tsb: seluruh baris products yang
-- harga_promo-nya persis 0 dikembalikan menjadi NULL, sesuai konsep
-- "harga promo kosong = tidak sedang promo".
--
-- CATATAN: kalau memang ada produk yang SENGAJA dijual dengan harga promo
-- Rp0 (mis. produk gratis/giveaway), migration ini akan ikut menghapus
-- nilai tsb. Kalau ada kasus seperti itu, isi ulang manual lewat halaman
-- Edit Produk setelah migration ini dijalankan.
-- =====================================================================

update products
set harga_promo = null
where harga_promo = 0;
