-- =====================================================================
-- NutWear Database Schema (Supabase PostgreSQL)
-- Dijalankan lewat Supabase SQL Editor. Urutan CREATE TABLE mengikuti
-- dependency foreign key (parent dulu, baru child).
-- =====================================================================

create extension if not exists "uuid-ossp";

-- 1. users
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  nama_lengkap varchar(100) not null,
  email varchar(100) unique not null,
  password_hash text not null,
  no_hp varchar(20),
  role varchar(20) not null default 'customer', -- 'customer' | 'admin'
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- 2. user_addresses
create table if not exists user_addresses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  receiver_name varchar(100) not null,
  phone varchar(20) not null,
  province varchar(100) not null,
  city varchar(100) not null,
  district varchar(100) not null,
  postal_code varchar(10) not null,
  address text not null,
  is_default boolean not null default false
);

-- 3. categories
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  nama_kategori varchar(100) not null,
  created_at timestamp not null default now()
);

-- 4. products
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete set null,
  nama_produk varchar(150) not null,
  slug varchar(150) unique not null,
  harga integer not null, -- Harga Normal
  harga_promo integer, -- Harga Promo (opsional), lihat migrations/20260708_add_product_promo_price_and_new_arrival.sql
  harga_promo_color varchar(20) not null default '#dc2626',
  promo_mulai date, -- Periode promo (opsional), lihat migrations/20260709_add_notifications_and_promo_period.sql
  promo_selesai date,
  is_new_arrival boolean not null default false,
  deskripsi text,
  berat integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- 5. product_images
create table if not exists product_images (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0
);

-- 6. product_variants
create table if not exists product_variants (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  ukuran varchar(10) not null,
  warna varchar(50) not null,
  sku varchar(50) unique not null,
  stok integer not null default 0,
  created_at timestamp not null default now()
);

-- 7. carts
create table if not exists carts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  quantity integer not null default 1,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  unique (user_id, variant_id)
);

-- 8. wishlists
create table if not exists wishlists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamp not null default now(),
  unique (user_id, product_id)
);

-- 9. orders
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  address_id uuid references user_addresses(id) on delete set null,
  total_price integer not null,
  shipping_cost integer not null default 0,
  grand_total integer not null,
  status varchar(30) not null default 'menunggu_pembayaran',
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- 10. order_items
create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null, -- nullable: lihat migrations/20260708_order_items_product_snapshot.sql
  quantity integer not null,
  price integer not null,
  -- Snapshot data produk saat checkout, supaya riwayat pesanan tetap utuh
  -- walau Produk/Variant aslinya sudah dihapus admin.
  product_name varchar(150),
  product_slug varchar(150),
  variant_sku varchar(50),
  variant_ukuran varchar(10),
  variant_warna varchar(50),
  image_url text,
  -- UPDATE 7 — lihat migrations/20260716_add_order_items_product_id.sql
  product_id uuid references products(id) on delete set null
);

-- 11. payments
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  midtrans_order_id varchar(100),
  transaction_id varchar(100),
  payment_type varchar(50),
  gross_amount integer,
  transaction_status varchar(30),
  fraud_status varchar(30),
  snap_token text,
  paid_at timestamp,
  created_at timestamp not null default now(),
  unique (order_id)
);

-- 12. reviews
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamp not null default now(),
  -- UPDATE 7 — Sistem Ulasan Produk berbasis Pesanan, lihat
  -- migrations/20260716_add_reviews_order_linkage.sql
  order_id uuid references orders(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null
);

-- 13. banners
create table if not exists banners (
  id uuid primary key default uuid_generate_v4(),
  title varchar(100) not null,
  image_url text not null,
  link text,
  is_active boolean not null default true
);

-- 13b. hero_banners (UPDATE 2 — dipisah dari banners, lihat migrations/20260714_create_hero_banners.sql)
create table if not exists hero_banners (
  id uuid primary key default uuid_generate_v4(),
  image_url text not null,
  image_path text not null,
  title varchar(150),
  link_type varchar(20) not null default 'none', -- 'none' | 'product' | 'category' | 'custom'
  product_id uuid references products(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  custom_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp not null default now(),
  constraint hero_banners_link_type_check check (link_type in ('none', 'product', 'category', 'custom'))
);

-- 14. stock_logs
create table if not exists stock_logs (
  id uuid primary key default uuid_generate_v4(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  quantity integer not null,
  type varchar(20) not null, -- 'in' | 'out' | 'adjustment'
  created_at timestamp not null default now()
);

-- 15. notifications (Update 1 — Sistem Notifikasi User)
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  type varchar(20) not null, -- 'order_status' | 'new_arrival' | 'promo'
  title varchar(150) not null,
  message text not null,
  link text,
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamp not null default now()
);

-- 16. product_pairs (mengikuti penomoran dokumen perencanaan)
create table if not exists product_pairs (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  paired_product_id uuid not null references products(id) on delete cascade,
  created_at timestamp not null default now(),
  unique (product_id, paired_product_id)
);

-- 17. password_reset_tokens — fitur Forgot Password, lihat
-- migrations/20260720_create_password_reset_tokens.sql
create table if not exists password_reset_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash varchar(64) not null unique,
  expires_at timestamp not null,
  used_at timestamp,
  created_at timestamp not null default now()
);

-- =====================================================================
-- Index tambahan untuk query yang sering dipakai (tidak mengubah skema,
-- hanya optimisasi pencarian/filter yang dibutuhkan Product API).
-- =====================================================================
create index if not exists idx_products_category_id on products(category_id);
create index if not exists idx_products_slug on products(slug);
create index if not exists idx_products_is_new_arrival on products(is_new_arrival);
create index if not exists idx_product_variants_product_id on product_variants(product_id);
create index if not exists idx_orders_user_id on orders(user_id);
create index if not exists idx_reviews_product_id on reviews(product_id);
create index if not exists idx_carts_user_id on carts(user_id);
create index if not exists idx_wishlists_user_id on wishlists(user_id);
create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread on notifications(user_id, is_read);
create index if not exists idx_password_reset_tokens_user_id on password_reset_tokens(user_id);
create index if not exists idx_password_reset_tokens_token_hash on password_reset_tokens(token_hash);
