-- =====================================================================
-- Migration: Reorder massal & atomik untuk Banner Produk dan Hero Banner
-- Jalankan lewat Supabase SQL Editor. Aman dijalankan berkali-kali
-- (create or replace) dan TIDAK mengubah struktur tabel / data yang ada.
--
-- UPDATE #4 — Drag & Drop urutan banner. Admin memindahkan item ke posisi
-- mana pun lalu backend menyimpan urutan akhirnya dalam SATU request:
--   reorder_banners(p_ids)       -> tabel banners
--   reorder_hero_banners(p_ids)  -> tabel hero_banners
-- (dua fungsi terpisah; urutan kedua tabel tidak pernah tercampur).
--
-- p_ids = SEMUA id dalam urutan akhir; sort_order = posisi array (0, 1, 2, ...).
-- Seluruh fungsi berjalan dalam satu transaksi, jadi kalau ada error tidak
-- pernah tersisa urutan setengah jadi. Baris dikunci (for update) agar dua
-- reorder bersamaan diserialkan, bukan saling menimpa.
--
-- Kode error (dipetakan backend ke HTTP status):
--   RB001 REORDER_EMPTY       daftar kosong / null            -> 400
--   RB002 REORDER_DUPLICATE   ada id ganda                    -> 400
--   RB003 REORDER_UNKNOWN_ID  ada id yang tidak ada di tabel  -> 409 (mis. baru dihapus
--                             admin lain, atau bukan milik tabel ini)
--   RB004 REORDER_STALE       daftar tidak lengkap (ada       -> 409
--                             banner baru di server)
-- =====================================================================

create or replace function public.reorder_banners(p_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_count int := coalesce(array_length(p_ids, 1), 0);
begin
  if v_count = 0 then
    raise exception 'REORDER_EMPTY' using errcode = 'RB001';
  end if;

  if (select count(distinct x) from unnest(p_ids) as x) <> v_count then
    raise exception 'REORDER_DUPLICATE' using errcode = 'RB002';
  end if;

  -- Serialkan reorder yang berjalan bersamaan (urutan kunci tetap = tanpa deadlock).
  perform 1 from banners order by id for update;

  if exists (select 1 from unnest(p_ids) as x where not exists (select 1 from banners b where b.id = x)) then
    raise exception 'REORDER_UNKNOWN_ID' using errcode = 'RB003';
  end if;

  if exists (select 1 from banners b where b.id <> all (p_ids)) then
    raise exception 'REORDER_STALE' using errcode = 'RB004';
  end if;

  update banners b
  set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where b.id = o.id;
end;
$$;

create or replace function public.reorder_hero_banners(p_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_count int := coalesce(array_length(p_ids, 1), 0);
begin
  if v_count = 0 then
    raise exception 'REORDER_EMPTY' using errcode = 'RB001';
  end if;

  if (select count(distinct x) from unnest(p_ids) as x) <> v_count then
    raise exception 'REORDER_DUPLICATE' using errcode = 'RB002';
  end if;

  perform 1 from hero_banners order by id for update;

  if exists (select 1 from unnest(p_ids) as x where not exists (select 1 from hero_banners h where h.id = x)) then
    raise exception 'REORDER_UNKNOWN_ID' using errcode = 'RB003';
  end if;

  if exists (select 1 from hero_banners h where h.id <> all (p_ids)) then
    raise exception 'REORDER_STALE' using errcode = 'RB004';
  end if;

  update hero_banners h
  set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where h.id = o.id;
end;
$$;

-- Hanya backend (service role) yang boleh memanggil. Tanpa ini, role anon /
-- authenticated Supabase bisa memanggil fungsi lewat PostgREST dan mengubah
-- urutan banner tanpa login admin.
revoke all on function public.reorder_banners(uuid[]) from public, anon, authenticated;
revoke all on function public.reorder_hero_banners(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_banners(uuid[]) to service_role;
grant execute on function public.reorder_hero_banners(uuid[]) to service_role;
