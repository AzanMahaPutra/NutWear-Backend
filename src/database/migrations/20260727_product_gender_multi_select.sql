-- =====================================================================
-- Migration: Gender Produk jadi Multi Select (Pria / Wanita / Uniseks)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali.
--
-- Sebelumnya kolom `gender` hanya menyimpan SATU nilai (dropdown wajib di
-- Admin Product). Sekarang Admin bisa memilih lebih dari satu kategori
-- gender sekaligus lewat Checkbox (mis. Pria + Uniseks), jadi disimpan
-- sebagai array teks (`genders text[]`) supaya struktur tetap fleksibel —
-- kategori gender baru di masa depan bisa ditambahkan tanpa mengubah lagi
-- struktur kolom.
--
-- Data lama di kolom `gender` (satu nilai) dipindahkan otomatis ke
-- `genders` (array berisi satu elemen yang sama) sebelum kolom lama
-- dihapus, jadi tidak ada data yang hilang.
-- =====================================================================

-- 1) Kolom baru, nullable dulu supaya bisa diisi dari data lama.
alter table products
  add column if not exists genders text[];

-- 2) Backfill dari kolom gender lama (satu nilai -> array satu elemen).
update products
  set genders = array[gender]
  where genders is null and gender is not null;

-- 3) Jaring pengaman untuk baris yang entah kenapa masih kosong (mis. gender
--    lama NULL) -> default 'uniseks', konsisten dengan default lama.
update products
  set genders = array['uniseks']
  where genders is null or array_length(genders, 1) is null;

alter table products
  alter column genders set default array['uniseks']::text[];

alter table products
  alter column genders set not null;

-- 4) Validasi: setiap elemen harus salah satu dari pria/wanita/uniseks, dan
--    minimal satu kategori wajib dipilih (array tidak boleh kosong).
alter table products
  drop constraint if exists products_genders_valid;

alter table products
  add constraint products_genders_valid check (
    genders <@ array['pria', 'wanita', 'uniseks']::text[]
    and array_length(genders, 1) > 0
  );

-- 5) Bersihkan kolom & constraint lama.
alter table products
  drop constraint if exists products_gender_check;

drop index if exists idx_products_gender;

alter table products
  drop column if exists gender;

-- 6) Index GIN supaya query "produk dengan gender X" (containment) tetap cepat.
create index if not exists idx_products_genders on products using gin (genders);

comment on column products.genders is 'Target gender produk (Multi Select): array berisi satu atau lebih dari pria, wanita, uniseks. Minimal satu wajib dipilih di form Admin. Card Produk menampilkan gender utama (prioritas Pria > Wanita > Uniseks) + badge "Uniseks" terpisah kalau produk juga ditandai uniseks. Detail Produk menampilkan seluruh kategori yang dipilih.';
