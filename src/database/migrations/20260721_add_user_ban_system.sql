-- =====================================================================
-- UPDATE — Fitur Banned User & Pengajuan Unban
-- Dijalankan lewat Supabase SQL Editor setelah migration sebelumnya.
-- =====================================================================

-- 1. Kolom status banned pada tabel users.
alter table users
  add column if not exists status varchar(20) not null default 'aktif',
  add column if not exists banned_reason text,
  add column if not exists banned_at timestamp,
  add column if not exists banned_by uuid references users(id);

-- Validasi nilai status supaya konsisten dengan enum di kode ('aktif' | 'banned').
alter table users
  drop constraint if exists users_status_check;
alter table users
  add constraint users_status_check check (status in ('aktif', 'banned'));

create index if not exists idx_users_status on users(status);

-- 2. Tabel riwayat pengajuan unban (Unban Request).
create table if not exists unban_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  -- Snapshot alasan banned pada saat pengajuan dibuat, supaya riwayat tetap
  -- utuh walau admin melakukan banned ulang dengan alasan berbeda di kemudian hari.
  banned_reason_snapshot text,
  request_reason text not null,
  status varchar(20) not null default 'menunggu', -- 'menunggu' | 'disetujui' | 'ditolak'
  created_at timestamp not null default now(),
  processed_at timestamp,
  processed_by uuid references users(id)
);

alter table unban_requests
  drop constraint if exists unban_requests_status_check;
alter table unban_requests
  add constraint unban_requests_status_check check (status in ('menunggu', 'disetujui', 'ditolak'));

create index if not exists idx_unban_requests_user_id on unban_requests(user_id);
create index if not exists idx_unban_requests_status on unban_requests(status);
