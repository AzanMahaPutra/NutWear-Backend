-- =====================================================================
-- Migration: Tabel Password Reset Token (fitur Forgot Password)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS).
--
-- Token TIDAK disimpan dalam bentuk plain text — yang disimpan hanya
-- SHA-256 hash dari token acak yang dikirim ke email user. Token asli
-- (plain) hanya pernah ada di URL email dan di memori request saat
-- proses reset berlangsung, tidak pernah ditulis ke database.
--
-- - token_hash : SHA-256 hash (hex, 64 karakter) dari token reset.
--                unique supaya tidak mungkin dua token aktif punya hash sama.
-- - expires_at : masa berlaku token (lihat authService — default 30 menit
--                sejak dibuat).
-- - used_at    : diisi begitu token dipakai untuk reset password yang
--                berhasil. Token dengan used_at terisi tidak boleh dipakai
--                lagi (dicek di authService.resetPassword).
-- =====================================================================

create table if not exists password_reset_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash varchar(64) not null unique,
  expires_at timestamp not null,
  used_at timestamp,
  created_at timestamp not null default now()
);

comment on table password_reset_tokens is 'Token reset password (Forgot Password). Menyimpan SHA-256 hash token, bukan token asli.';
comment on column password_reset_tokens.token_hash is 'SHA-256 hex hash dari token reset yang dikirim ke email user.';
comment on column password_reset_tokens.used_at is 'Diisi saat token berhasil dipakai untuk reset password — mencegah token dipakai dua kali.';

create index if not exists idx_password_reset_tokens_user_id on password_reset_tokens(user_id);
create index if not exists idx_password_reset_tokens_token_hash on password_reset_tokens(token_hash);
