-- =====================================================================
-- Migration: Pengaturan Tampilan Gambar Banner (image display adjustment)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS) dan tidak mengubah data/gambar yang sudah ada.
--
-- Menambahkan 3 kolom pada tabel banners supaya admin bisa mengatur BAGAIMANA
-- gambar latar ditampilkan (bukan mengedit file gambarnya):
--   image_position_x : object-position horizontal, 0-100 (%), default 50 (tengah)
--   image_position_y : object-position vertikal,   0-100 (%), default 50 (tengah)
--   image_scale      : zoom, 1.00-3.00, default 1.00 (tanpa zoom)
-- Default (50, 50, 1) = persis tampilan lama (object-cover, center), jadi banner
-- yang sudah ada tidak berubah sama sekali.
-- =====================================================================

alter table banners
  add column if not exists image_position_x smallint not null default 50,
  add column if not exists image_position_y smallint not null default 50,
  add column if not exists image_scale numeric(3, 2) not null default 1.00;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'banners_image_position_x_check') then
    alter table banners add constraint banners_image_position_x_check check (image_position_x between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'banners_image_position_y_check') then
    alter table banners add constraint banners_image_position_y_check check (image_position_y between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'banners_image_scale_check') then
    alter table banners add constraint banners_image_scale_check check (image_scale between 1.00 and 3.00);
  end if;
end $$;

comment on column banners.image_position_x is 'Posisi horizontal gambar latar (object-position X, 0-100%). Default 50.';
comment on column banners.image_position_y is 'Posisi vertikal gambar latar (object-position Y, 0-100%). Default 50.';
comment on column banners.image_scale is 'Zoom gambar latar (1.00-3.00). Default 1.00 = tanpa zoom.';
