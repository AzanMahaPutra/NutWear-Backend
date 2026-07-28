-- =====================================================================
-- UPDATE — Review Helpful (Membantu / Tidak Membantu)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah/menghapus data yang sudah ada.
--
-- Setiap user hanya boleh memiliki SATU vote per review (unique index
-- (review_id, user_id)). Vote disimpan sebagai baris tersendiri (bukan
-- kolom counter di tabel reviews) supaya:
--   1. Bisa dicek apakah user tertentu sudah vote & apa pilihannya
--      (dipakai untuk highlight tombol aktif & mencegah vote ganda).
--   2. Jumlah vote selalu dihitung langsung dari data asli (tidak ada
--      counter yang bisa "nyasar"/tidak sinkron).
--   3. Vote tetap tersimpan walau user logout lalu login kembali (bukan
--      state lokal di browser).
--
-- vote bernilai 'membantu' atau 'tidak_membantu'. Mengganti pilihan =
-- UPDATE baris yang sama (lihat reviewVoteRepository.upsert), menghapus
-- pilihan = DELETE baris (lihat reviewVoteRepository.remove).
-- =====================================================================

create table if not exists review_votes (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references reviews(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  vote varchar(20) not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  unique (review_id, user_id)
);

alter table review_votes
  drop constraint if exists review_votes_vote_check;

alter table review_votes
  add constraint review_votes_vote_check check (vote in ('membantu', 'tidak_membantu'));

comment on table review_votes is 'Vote Membantu/Tidak Membantu pada review produk (UPDATE — Review Helpful). Satu user hanya boleh punya satu baris per review.';
comment on column review_votes.vote is 'Pilihan vote: membantu atau tidak_membantu. Mengganti pilihan = update baris ini, bukan insert baru.';

create index if not exists idx_review_votes_review_id on review_votes(review_id);
create index if not exists idx_review_votes_user_id on review_votes(user_id);
