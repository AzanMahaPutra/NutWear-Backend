-- =====================================================================
-- Migration: Hero Banner (terpisah dari Banner Produk / tabel `banners`)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah data Banner Produk yang ada.
--
-- UPDATE 2 — Memisahkan Hero Banner dari Banner Produk.
-- Hero Banner hanya dipakai untuk banner utama full-width di halaman
-- Beranda (gambar + judul opsional + link tujuan), sengaja dibuat sebagai
-- tabel baru yang jauh lebih sederhana dibanding Banner Produk (`banners`,
-- yang berisi banyak field styling Banner Builder: brand, harga, CTA, dsb).
-- =====================================================================

create table if not exists hero_banners (
  id uuid primary key default uuid_generate_v4(),
  image_url text not null,
  image_path text not null,
  title varchar(150),
  -- Jenis tujuan saat Hero Banner diklik user di Beranda.
  -- 'none'     -> tidak bisa diklik.
  -- 'product'  -> menuju halaman Detail Produk (product_id).
  -- 'category' -> menuju halaman Produk dengan filter kategori (category_id).
  -- 'custom'   -> menuju path/URL bebas di dalam website (custom_url).
  link_type varchar(20) not null default 'none',
  product_id uuid references products(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  custom_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp not null default now(),
  constraint hero_banners_link_type_check check (link_type in ('none', 'product', 'category', 'custom'))
);

comment on table hero_banners is 'Hero Banner utama halaman Beranda — terpisah dari Banner Produk (tabel banners). Lihat UPDATE 2.';
comment on column hero_banners.link_type is 'Jenis tujuan link saat diklik: none | product | category | custom.';

create index if not exists idx_hero_banners_sort_order on hero_banners(sort_order);
create index if not exists idx_hero_banners_product_id on hero_banners(product_id);
create index if not exists idx_hero_banners_category_id on hero_banners(category_id);
