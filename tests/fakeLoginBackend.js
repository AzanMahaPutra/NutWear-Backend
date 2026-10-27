/**
 * Fake Supabase untuk test rate limit login — hanya untuk tes lokal.
 *
 * Yang ditiru:
 *  - GoTrue  POST /auth/v1/token?grant_type=password  (signInWithPassword)
 *  - PostgREST GET /rest/v1/users?id=eq.<id>           (profil, dipakai authService.login)
 *  - PostgREST RPC rate_limit_hit / rate_limit_status   (meniru semantik SQL di
 *    migrations/20261023_login_rate_limit_status.sql baris demi baris)
 *
 * BUKAN database sungguhan. Semantik SQL yang ASLI diuji terpisah pada PostgreSQL sungguhan
 * oleh tests/integration/loginRateLimit.postgres.test.js (butuh TEST_DATABASE_URL).
 *
 * `dbClockSkewMs` memajukan/memundurkan jam "database" relatif terhadap jam proses uji —
 * dipakai untuk membuktikan sisa waktu dihitung di sisi database (bebas clock skew).
 */
function createFakeLoginBackend({ accounts }) {
  const state = {
    rateLimits: new Map(), // key -> { hits, windowStart, blockedUntil }  (waktu dalam jam DB)
    dbClockSkewMs: 0,
    rpcMode: "ok", // ok | http500 | missing | malformed | network
    rpcCalls: [], // { fn, args }
    authCalls: 0,
  };

  const dbNow = () => Date.now() + state.dbClockSkewMs;
  const json = (status, body) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  function hit(key, windowMs, max, cooldownMs) {
    const now = dbNow();
    let r = state.rateLimits.get(key);
    if (!r) {
      r = { hits: 0, windowStart: now, blockedUntil: null };
      state.rateLimits.set(key, r);
    }
    if (r.blockedUntil !== null && r.blockedUntil > now) {
      return { total_hits: max + 1, reset_at: new Date(r.blockedUntil).toISOString(), retry_after_ms: Math.max(1, Math.ceil(r.blockedUntil - now)) };
    }
    if (r.blockedUntil !== null || r.windowStart + windowMs <= now) {
      r.hits = 0;
      r.windowStart = now;
      r.blockedUntil = null;
    }
    r.hits += 1;
    if (r.hits > max) r.blockedUntil = now + cooldownMs;
    const reset = r.blockedUntil ?? r.windowStart + windowMs;
    return { total_hits: r.hits, reset_at: new Date(reset).toISOString(), retry_after_ms: Math.max(0, Math.ceil(reset - now)) };
  }

  function status(key) {
    const now = dbNow();
    const r = state.rateLimits.get(key);
    if (r && r.blockedUntil !== null && r.blockedUntil > now) {
      return { blocked: true, retry_after_ms: Math.max(1, Math.ceil(r.blockedUntil - now)) };
    }
    return { blocked: false, retry_after_ms: 0 };
  }

  async function fakeFetch(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();

    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      state.authCalls += 1;
      const { email, password } = JSON.parse(init.body);
      const acc = accounts.find((a) => a.email === email && a.password === password);
      if (!acc) return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return json(200, {
        access_token: `access-${acc.id}`,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: `refresh-${acc.id}`,
        user: { id: acc.id, aud: "authenticated", email: acc.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      });
    }

    if (url.pathname === "/rest/v1/users" && method === "GET") {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      const acc = accounts.find((a) => a.id === id);
      return json(200, acc ? [{ id: acc.id, nama_lengkap: acc.nama, email: acc.email, no_hp: null, role: "customer", status: "aktif" }] : []);
    }

    const rpc = /^\/rest\/v1\/rpc\/(rate_limit_hit|rate_limit_status)$/.exec(url.pathname);
    if (rpc && method === "POST") {
      const fn = rpc[1];
      const args = JSON.parse(init.body);
      state.rpcCalls.push({ fn, args });
      if (state.rpcMode === "network") throw new TypeError("fetch failed");
      if (state.rpcMode === "http500") return json(500, { message: "simulasi database down: connection refused", code: "XX000" });
      if (state.rpcMode === "missing") {
        return json(404, { code: "PGRST202", message: "Could not find the function public.rate_limit_status in the schema cache" });
      }
      if (state.rpcMode === "malformed") return json(200, []);
      return json(200, [fn === "rate_limit_hit" ? hit(args.p_key, args.p_window_ms, args.p_max, args.p_cooldown_ms) : status(args.p_key)]);
    }

    return json(404, { message: `fake: ${method} ${url.pathname} tidak ditiru` });
  }

  return { fakeFetch, state };
}

module.exports = { createFakeLoginBackend };
