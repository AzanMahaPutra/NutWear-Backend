-- =====================================================================
-- UPDATE 1 — Sistem Notifikasi User
-- Menambahkan tabel `notifications` (fan-out per user, supaya status
-- baca/belum-baca independen per user) dan kolom periode promo pada
-- `products` (dibutuhkan agar notifikasi Promo Produk bisa menampilkan
-- periode promo, lihat services/notificationService.js).
-- =====================================================================

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  type varchar(20) not null, -- 'order_status' | 'new_arrival' | 'promo'
  title varchar(150) not null,
  message text not null,
  link text, -- path frontend tujuan saat notifikasi diklik (opsional)
  reference_id uuid, -- orderId / productId terkait, opsional (untuk konteks saja)
  is_read boolean not null default false,
  created_at timestamp not null default now()
);

create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread on notifications(user_id, is_read);

alter table products
  add column if not exists promo_mulai date,
  add column if not exists promo_selesai date;

comment on column products.promo_mulai is 'Tanggal mulai periode promo (opsional). Dipakai pada isi Notifikasi Promo Produk.';
comment on column products.promo_selesai is 'Tanggal selesai periode promo (opsional). Dipakai pada isi Notifikasi Promo Produk.';
