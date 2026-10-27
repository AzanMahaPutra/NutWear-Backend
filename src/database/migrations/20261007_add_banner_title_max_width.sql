-- =====================================================================
-- Migration: Pengaturan Lebar Maksimal Kontainer Teks/Judul Banner (title_max_width)
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali (IF NOT EXISTS).
--
-- Menambahkan kolom title_max_width (px) pada tabel banners supaya admin bisa
-- mengatur lebar kontainer judul/teks banner di desktop secara dinamis (300px - 1200px),
-- dengan fallback responsif otomatis (min(100%, maxWidth)) di layar mobile.
-- Default = 480 (px, sama dengan max-w-md bawaan).
-- =====================================================================

alter table banners
  add column if not exists title_max_width integer not null default 480;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'banners_title_max_width_check') then
    alter table banners add constraint banners_title_max_width_check check (title_max_width between 300 and 1200);
  end if;
end $$;

comment on column banners.title_max_width is 'Lebar maksimal teks/judul banner dalam pixel (300-1200px). Default 480.';
