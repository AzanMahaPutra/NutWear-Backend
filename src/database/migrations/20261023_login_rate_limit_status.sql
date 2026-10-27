-- UPDATE 11 — Rate limit login: status blokir persisten yang bisa ditanyakan ulang.
--
-- Tabel `public.rate_limits` dari 20260728_create_rate_limits.sql SUDAH memadai
-- (key, hits, window_start, blocked_until timestamptz) — TIDAK ada perubahan tabel.
-- `blocked_until` adalah satu-satunya sumber kebenaran waktu berakhir blokir dan
-- selalu diisi dari jam DATABASE (clock_timestamp()), bukan jam instance backend,
-- sehingga konsisten untuk semua instance serverless.
--
-- Yang ditambahkan di migrasi ini:
--   1) rate_limit_status(p_key): pembacaan READ-ONLY (tidak menambah counter, tidak
--      memperpanjang blokir) supaya frontend bisa memperoleh kembali status blokir
--      setelah refresh halaman / tab baru.
--   2) rate_limit_hit(...) diganti agar juga mengembalikan `retry_after_ms` — sisa
--      waktu yang dihitung DI DATABASE (reset_at - now). Backend tidak lagi
--      mengurangkan timestamp DB dengan jam servernya sendiri, jadi selisih jam
--      (clock skew) antara instance dan database tidak memengaruhi countdown.
--      Kolom lama (total_hits, reset_at) tetap ada & artinya tidak berubah.
--
-- Urutan deploy: jalankan migrasi ini SEBELUM deploy kode backend yang baru.
-- Aman dijalankan ulang (idempotent). Seluruhnya dalam satu transaksi.

begin;

-- Return type berubah (kolom baru) → fungsi lama harus di-DROP dulu; CREATE OR REPLACE
-- tidak bisa mengubah kolom OUT.
drop function if exists public.rate_limit_hit(text, integer, integer, integer);

create function public.rate_limit_hit(
  p_key         text,
  p_window_ms   integer,
  p_max         integer,
  p_cooldown_ms integer
)
returns table (total_hits integer, reset_at timestamptz, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := clock_timestamp();
  v_reset timestamptz;
  r       public.rate_limits%rowtype;
begin
  insert into public.rate_limits (key, hits, window_start)
  values (p_key, 0, v_now)
  on conflict (key) do nothing;

  -- `for update` menserialkan request paralel pada key yang sama (lintas instance).
  select * into r from public.rate_limits where key = p_key for update;

  -- Masih cooldown → tolak tanpa mengubah apa pun (cooldown TIDAK diperpanjang).
  if r.blocked_until is not null and r.blocked_until > v_now then
    return query select
      p_max + 1,
      r.blocked_until,
      greatest(1, ceil(extract(epoch from (r.blocked_until - v_now)) * 1000))::integer;
    return;
  end if;

  -- Cooldown sudah selesai, atau window lama sudah lewat → mulai window baru.
  if r.blocked_until is not null
     or r.window_start + make_interval(secs => p_window_ms / 1000.0) <= v_now then
    r.hits := 0;
    r.window_start := v_now;
    r.blocked_until := null;
  end if;

  r.hits := r.hits + 1;
  if r.hits > p_max then
    r.blocked_until := v_now + make_interval(secs => p_cooldown_ms / 1000.0);
  end if;

  update public.rate_limits
     set hits = r.hits, window_start = r.window_start, blocked_until = r.blocked_until
   where key = p_key;

  -- Pembersihan oportunistik baris lama (~1% request) supaya tabel tidak membengkak.
  if random() < 0.01 then
    delete from public.rate_limits
     where window_start < v_now - interval '1 day'
       and (blocked_until is null or blocked_until < v_now);
  end if;

  v_reset := coalesce(r.blocked_until, r.window_start + make_interval(secs => p_window_ms / 1000.0));
  return query select
    r.hits,
    v_reset,
    greatest(0, ceil(extract(epoch from (v_reset - v_now)) * 1000))::integer;
end;
$$;

-- Status blokir untuk satu key. READ-ONLY: tidak insert/update/lock, tidak menambah hit.
-- blocked = true hanya selama blocked_until masih di masa depan (menurut jam DB).
create or replace function public.rate_limit_status(p_key text)
returns table (blocked boolean, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := clock_timestamp();
  v_until timestamptz;
begin
  select blocked_until into v_until from public.rate_limits where key = p_key;

  if v_until is not null and v_until > v_now then
    return query select true, greatest(1, ceil(extract(epoch from (v_until - v_now)) * 1000))::integer;
  else
    return query select false, 0;
  end if;
end;
$$;

-- Hanya backend (service role) yang boleh memanggil fungsi-fungsi ini; RLS tabel tetap
-- aktif tanpa policy (anon/authenticated tidak bisa membaca/menulis langsung).
revoke all on function public.rate_limit_hit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer, integer) to service_role;

revoke all on function public.rate_limit_status(text) from public, anon, authenticated;
grant execute on function public.rate_limit_status(text) to service_role;

commit;
