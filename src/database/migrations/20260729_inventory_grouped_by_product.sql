-- =====================================================================
-- UPDATE #2 — Inventory Stock dikelompokkan per Produk.
-- Hanya menambah FUNGSI (tidak ada perubahan tabel/kolom). Aman dijalankan
-- berkali-kali lewat Supabase SQL Editor.
--
-- Kenapa fungsi SQL (RPC), bukan query PostgREST biasa:
--   PostgREST tidak bisa GROUP BY + filter atas agregat anak (mis. "produk yang
--   punya minimal satu varian menipis") + hitung total produk untuk
--   pagination dalam satu query. Tanpa fungsi ini grouping terpaksa dilakukan
--   di Node/browser dengan memuat puluhan ribu varian — dihindari sesuai
--   kebutuhan. Pola yang sama sudah dipakai di rate_limit_hit
--   (20260728_create_rate_limits.sql).
--
-- Definisi status per varian (SAMA dengan stockService.statusForStock &
-- frontend getStockStatus):
--   stok <= 0               -> habis
--   stok <= p_minimum       -> menipis
--   stok >  p_minimum       -> aman
--
-- Filter p_status (level PRODUK):
--   'menipis' -> produk dengan MINIMAL SATU varian menipis
--   'habis'   -> produk dengan MINIMAL SATU varian habis
--   'aman'    -> produk yang SEMUA variannya aman ("Semua Aman")
--   null      -> semua produk
-- Search: nama produk ATAU SKU salah satu varian (ILIKE). Agregat selalu
-- dihitung dari SEMUA varian produk, bukan hanya varian yang cocok search.
-- =====================================================================

create or replace function public.inventory_products(
  p_search  text,
  p_status  text,
  p_minimum integer,
  p_limit   integer,
  p_offset  integer
)
returns table (
  product_id     uuid,
  nama_produk    text,
  slug           text,
  image_url      text,
  total_variants bigint,
  total_stok     bigint,
  aman_count     bigint,
  menipis_count  bigint,
  habis_count    bigint,
  total_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select
      p.id,
      p.nama_produk::text as nama_produk,
      p.slug::text        as slug,
      count(v.id)                                              as total_variants,
      coalesce(sum(v.stok), 0)                                 as total_stok,
      count(*) filter (where v.stok > p_minimum)               as aman_count,
      count(*) filter (where v.stok > 0 and v.stok <= p_minimum) as menipis_count,
      count(*) filter (where v.stok <= 0)                      as habis_count
    from products p
    join product_variants v on v.product_id = p.id
    where p.is_active = true
      and (
        p_search is null
        or p.nama_produk ilike '%' || p_search || '%'
        or exists (
          select 1 from product_variants s
          where s.product_id = p.id and s.sku ilike '%' || p_search || '%'
        )
      )
    group by p.id, p.nama_produk, p.slug
  ),
  filtered as (
    select * from agg a
    where p_status is null
       or (p_status = 'menipis' and a.menipis_count > 0)
       or (p_status = 'habis'   and a.habis_count > 0)
       or (p_status = 'aman'    and a.aman_count = a.total_variants)
  )
  select
    f.id,
    f.nama_produk,
    f.slug,
    (select i.image_url from product_images i where i.product_id = f.id order by i.sort_order asc limit 1),
    f.total_variants,
    f.total_stok,
    f.aman_count,
    f.menipis_count,
    f.habis_count,
    count(*) over () as total_count
  from filtered f
  order by f.nama_produk asc, f.id asc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Hanya backend (service role) yang boleh memanggil fungsi ini.
revoke all on function public.inventory_products(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.inventory_products(text, text, integer, integer, integer) to service_role;
