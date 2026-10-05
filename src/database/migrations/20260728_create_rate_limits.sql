-- UPDATE #1 — Rate limit login yang konsisten di serverless / multi-instance.
-- Backend berjalan di Vercel (serverless), jadi counter in-memory per proses
-- tidak konsisten antar instance. Counter dipindah ke Postgres (Supabase yang
-- sudah dipakai project ini), diakses HANYA oleh backend (service role).

create table if not exists public.rate_limits (
  key           text primary key,
  hits          integer     not null default 0,
  window_start  timestamptz not null default now(),
  blocked_until timestamptz
);

-- RLS aktif tanpa policy: anon/authenticated tidak bisa membaca/menulis tabel ini.
alter table public.rate_limits enable row level security;

-- Satu "hit" atomik. `for update` menserialkan request paralel pada key yang
-- sama, jadi tidak ada race condition antar instance.
--   - Di dalam window: hits bertambah. Begitu hits > p_max → cooldown dimulai
--     (blocked_until = now + p_cooldown_ms).
--   - Selama cooldown: request ditolak & TIDAK memperpanjang cooldown.
--   - Setelah window/cooldown lewat: counter di-reset.
-- Mengembalikan (total_hits, reset_at); total_hits = p_max + 1 berarti ditolak.
create or replace function public.rate_limit_hit(
  p_key         text,
  p_window_ms   integer,
  p_max         integer,
  p_cooldown_ms integer
)
returns table (total_hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  r     public.rate_limits%rowtype;
begin
  insert into public.rate_limits (key, hits, window_start)
  values (p_key, 0, v_now)
  on conflict (key) do nothing;

  select * into r from public.rate_limits where key = p_key for update;

  -- Masih cooldown → tolak tanpa mengubah apa pun.
  if r.blocked_until is not null and r.blocked_until > v_now then
    return query select p_max + 1, r.blocked_until;
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

  return query select r.hits, coalesce(r.blocked_until, r.window_start + make_interval(secs => p_window_ms / 1000.0));
end;
$$;

-- Hanya backend (service role) yang boleh memanggil fungsi ini.
revoke all on function public.rate_limit_hit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer, integer) to service_role;
