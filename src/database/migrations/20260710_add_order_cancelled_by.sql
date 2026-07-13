-- =====================================================================
-- Migration: Kolom cancelled_by pada orders (Update 2 — Aksi pada Riwayat
-- Pesanan User, poin 3 & 7: "Admin juga dapat melihat bahwa pesanan telah
-- dibatalkan oleh user").
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Kolom ini menyimpan siapa yang membatalkan pesanan (user via tombol
-- "Batalkan Pesanan" di Riwayat Pesanan, atau admin lewat ubah status manual
-- di halaman Manajemen Pesanan). Nilainya null untuk pesanan yang belum
-- pernah dibatalkan / dibuat sebelum migration ini berjalan.
-- =====================================================================

alter table orders
  add column if not exists cancelled_by varchar(10);

comment on column orders.cancelled_by is 'Siapa yang membatalkan pesanan: "user" (tombol Batalkan Pesanan) atau "admin" (ubah status manual). Null jika belum pernah dibatalkan.';
