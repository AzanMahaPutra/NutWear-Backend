-- =====================================================================
-- UPDATE 5 — Detail Produk dapat Dikelola per Produk
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah/menghapus data yang sudah ada.
--
-- Sebelumnya bagian "Detail", "Material / Perawatan",
-- "Pengiriman / Penukaran / Pengembalian", dan "Produksi" pada accordion
-- Deskripsi di halaman Detail Produk memakai teks statis yang sama untuk
-- semua produk. Sekarang setiap produk bisa punya isi sendiri untuk
-- masing-masing bagian tersebut, diisi admin lewat halaman Tambah/Edit
-- Produk dan disimpan di kolom baru pada tabel `products`.
--
-- Produk lama yang belum pernah diisi kolom ini tetap tampil normal —
-- frontend menampilkan pesan "Informasi belum tersedia." pada bagian
-- yang masih kosong, jadi migration ini tidak menyebabkan error pada
-- data lama.
-- =====================================================================

alter table products add column if not exists detail_info text;
alter table products add column if not exists material_care_info text;
alter table products add column if not exists shipping_return_info text;
alter table products add column if not exists production_info text;

comment on column products.detail_info is 'UPDATE 5 — Isi accordion "Detail" pada Detail Produk, diisi admin per produk.';
comment on column products.material_care_info is 'UPDATE 5 — Isi accordion "Material / Perawatan" pada Detail Produk, diisi admin per produk.';
comment on column products.shipping_return_info is 'UPDATE 5 — Isi accordion "Pengiriman / Penukaran / Pengembalian" pada Detail Produk, diisi admin per produk.';
comment on column products.production_info is 'UPDATE 5 — Isi accordion "Produksi" pada Detail Produk, diisi admin per produk.';
