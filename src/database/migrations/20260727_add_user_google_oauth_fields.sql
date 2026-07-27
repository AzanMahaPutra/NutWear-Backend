-- =====================================================================
-- UPDATE — Login dengan Google (OAuth via Supabase Auth)
-- Dijalankan lewat Supabase SQL Editor setelah migration sebelumnya.
--
-- Tabel `users` tetap tabel PROFIL yang melengkapi `auth.users` bawaan
-- Supabase (lihat backend/migrations/20260720_migrate_to_supabase_auth.sql).
-- Kredensial Google (Client ID/Secret) TIDAK disimpan di sini sama sekali —
-- itu dikonfigurasi langsung di Supabase Dashboard → Authentication →
-- Providers → Google (lihat CHANGELOG.md untuk langkah lengkapnya).
-- =====================================================================

-- 1. Kolom `provider`: mencatat metode yang dipakai SAAT akun pertama kali
--    dibuat ('email' lewat Register biasa, atau 'google' lewat Login Google
--    pertama kali). Hanya diisi saat baris dibuat (lihat authService.js),
--    TIDAK pernah diubah lagi setelahnya — murni catatan asal akun, bukan
--    daftar metode login yang aktif (satu akun tetap bisa dipakai login
--    lewat Email & Password maupun Google sekaligus setelah tertaut,
--    lihat CHANGELOG.md soal Identity Linking Supabase Auth).
alter table users
  add column if not exists provider varchar(20) not null default 'email';

alter table users
  drop constraint if exists users_provider_check;
alter table users
  add constraint users_provider_check check (provider in ('email', 'google'));

create index if not exists idx_users_provider on users(provider);

-- 2. Kolom `avatar_url`: foto profil dari Google (jika tersedia) saat akun
--    dibuat lewat Login Google. Hanya diisi saat baris dibuat — tidak pernah
--    ditimpa lagi oleh login berikutnya, supaya foto yang sudah diganti user
--    sendiri lewat halaman Profile (fitur masa depan) tidak pernah tertimpa
--    balik oleh foto Google (lihat authService.loginWithGoogle).
alter table users
  add column if not exists avatar_url text;
