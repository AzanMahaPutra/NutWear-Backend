-- =====================================================================
-- UPDATE — Balasan Review oleh Admin
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah/menghapus data yang sudah ada.
--
-- Setiap review maksimal memiliki SATU balasan resmi dari Admin. Balasan
-- disimpan sebagai kolom langsung pada tabel `reviews` (bukan tabel
-- terpisah) karena relasinya murni 1-ke-1 (Review -> Reply Admin) — lebih
-- sederhana untuk query (satu SELECT ulasan sudah langsung tahu ada
-- balasannya atau tidak) tanpa kehilangan kerapian relasi:
--
-- - admin_reply     : isi balasan Admin. NULL berarti review ini belum
--                      dibalas.
-- - admin_reply_at  : kapan balasan dibuat/terakhir diperbarui (dipakai
--                      untuk menampilkan tanggal pada card balasan).
-- - admin_reply_by  : Admin (users.id) yang membalas/mengedit balasan ini.
--                      ON DELETE SET NULL supaya balasan tetap ada walau
--                      akun Admin yang bersangkutan suatu saat dihapus.
-- =====================================================================

alter table reviews
  add column if not exists admin_reply text,
  add column if not exists admin_reply_at timestamp,
  add column if not exists admin_reply_by uuid references users(id) on delete set null;

comment on column reviews.admin_reply is 'Balasan resmi Admin/toko untuk review ini. NULL jika belum dibalas. Setiap review maksimal satu balasan (UPDATE terhadap kolom ini, bukan baris baru).';
comment on column reviews.admin_reply_at is 'Waktu balasan dibuat, atau terakhir diedit oleh Admin.';
comment on column reviews.admin_reply_by is 'Admin yang membalas/terakhir mengedit balasan ini.';

create index if not exists idx_reviews_admin_reply_by on reviews(admin_reply_by);
