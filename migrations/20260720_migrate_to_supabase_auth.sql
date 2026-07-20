-- ======================================================================
-- Migrasi: pindah dari sistem Auth custom ke Supabase Auth bawaan
-- Jalankan di Supabase Dashboard → SQL Editor (atau lewat Supabase CLI).
-- BACA CATATAN DI BAGIAN BAWAH FILE INI sebelum menjalankan di production.
-- ======================================================================

-- 1) Tabel `users` sekarang jadi tabel PROFIL yang melengkapi `auth.users`
--    bawaan Supabase (nama_lengkap, no_hp, role). Kolom `id` wajib sama
--    dengan `auth.users.id`, dan `password_hash` sudah tidak dipakai karena
--    password sepenuhnya dikelola Supabase Auth.

-- Hapus kolom password_hash (password sekarang di auth.users, dikelola Supabase).
alter table public.users
  drop column if exists password_hash;

-- Pastikan id tidak lagi auto-generate sendiri (id sekarang datang dari
-- auth.users.id, diisi eksplisit oleh backend saat Register).
alter table public.users
  alter column id drop default;

-- Tautkan id ke auth.users supaya konsisten & ikut terhapus otomatis kalau
-- akun Supabase Auth-nya dihapus (mis. lewat Dashboard).
alter table public.users
  add constraint users_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- 2) Tabel password_reset_tokens (dan isinya) sudah tidak dipakai sama sekali
--    — Forgot Password sekarang sepenuhnya ditangani Supabase Auth. Aman
--    dihapus. Backup dulu kalau butuh riwayatnya untuk audit.
drop table if exists public.password_reset_tokens;

-- ======================================================================
-- CATATAN PENTING — WAJIB DIBACA SEBELUM MENJALANKAN DI PROJECT LIVE:
--
-- 1. MIGRASI DATA USER LAMA (jika sudah ada user terdaftar dari sistem
--    custom sebelumnya): baris-baris di tabel `users` saat ini punya `id`
--    hasil generate sendiri, BUKAN id dari `auth.users` — karena akun
--    Supabase Auth untuk mereka belum ada. Menjalankan migrasi ini APA
--    ADANYA akan membuat FK constraint di atas GAGAL kalau tabel `users`
--    sudah berisi data. Untuk project yang sudah punya user asli, sebelum
--    menjalankan file ini:
--      a. Buat akun Supabase Auth untuk tiap user lama lewat Admin API
--         (`supabase.auth.admin.createUser`), pakai email yang sama.
--      b. UPDATE baris `users` yang bersangkutan supaya `id`-nya diganti
--         menjadi id baru dari auth.users (ganti juga foreign key di
--         tabel lain yang mereferensikan users.id — orders, addresses,
--         cart, wishlist, reviews, notifications, dst).
--      c. Password bcrypt lama TIDAK BISA dipindahkan langsung ke Supabase
--         Auth (algoritma hash berbeda) — user lama perlu memakai fitur
--         Forgot Password untuk membuat password baru, atau set password
--         sementara lewat Admin API lalu minta user menggantinya.
--    Kalau project ini masih di tahap development/belum ada user asli,
--    langkah di atas TIDAK perlu, tinggal kosongkan tabel `users` lama
--    dulu sebelum menjalankan migrasi ini.
--
-- 2. RLS: karena seluruh akses ke tabel `users` di app ini lewat backend
--    memakai Service Role Key (bypass RLS — lihat src/config/supabase.js),
--    Row Level Security TIDAK wajib diaktifkan supaya fitur di atas
--    berfungsi. Tetap direkomendasikan sebagai lapisan keamanan tambahan
--    (jaga-jaga kalau suatu saat ada kode yang memakai anon/publishable
--    key untuk mengakses tabel ini langsung):
--
--   alter table public.users enable row level security;
--   create policy "Users can view own profile"
--     on public.users for select
--     using (auth.uid() = id);
--   create policy "Users can update own profile"
--     on public.users for update
--     using (auth.uid() = id);
-- ======================================================================
