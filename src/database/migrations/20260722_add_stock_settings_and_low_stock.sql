-- =====================================================================
-- UPDATE — Notifikasi Stok Menipis untuk Admin
-- Menambahkan tabel `stock_settings` (single-row, id selalu 1) untuk
-- menyimpan Batas Minimum Stok yang bisa diubah Admin kapan saja lewat
-- halaman Pengaturan. Nilai ini dipakai di seluruh sistem: widget "Stok
-- Menipis" pada Dashboard Admin, filter "Tampilkan hanya stok menipis" pada
-- Manajemen Produk, dan badge status stok (Stok Aman/Menipis/Habis).
--
-- Tidak ada tabel notifikasi baru yang perlu diisi (fan-out per baris) —
-- daftar stok menipis dihitung langsung dari product_variants.stok setiap
-- kali diminta (GET /stock/low-stock), jadi selalu real-time dan otomatis
-- ikut berubah begitu Batas Minimum Stok diubah Admin.
-- =====================================================================

create table if not exists stock_settings (
  id smallint primary key default 1,
  minimum_stock integer not null default 15,
  updated_at timestamp not null default now(),
  constraint stock_settings_single_row check (id = 1)
);

insert into stock_settings (id, minimum_stock)
values (1, 15)
on conflict (id) do nothing;
