/**
 * UPDATE 11 — Tes INTEGRASI rate limit login pada PostgreSQL sungguhan.
 * Dilewati otomatis bila TEST_DATABASE_URL tidak diset (tidak ikut `npm test`).
 *
 * Jalankan (butuh `psql` dan sebuah database KOSONG/sekali-pakai — tabel rate_limits di-DROP!):
 *   TEST_DATABASE_URL="host=/tmp port=54329 user=postgres dbname=nutwear_test" \
 *     node --test tests/integration/loginRateLimit.postgres.test.js
 * Database harus punya role anon, authenticated, service_role (ada di Supabase; buat manual di Postgres biasa).
 *
 * Membuktikan: (1) SQL migrasi 20260728 + 20261023 benar (sampai batas, blokir 300 dtk, tidak
 * diperpanjang, status read-only, kedaluwarsa), (2) atomik di bawah beban paralel, (3) dua PROSES
 * backend terpisah berbagi satu status blokir, dan blokir bertahan walau proses dimatikan.
 * Yang TIDAK dibuktikan: PostgREST/Supabase sungguhan (RPC dijembatani lewat psql) dan beban
 * multi-region.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync, execFile, spawn } = require("node:child_process");

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && "TEST_DATABASE_URL tidak diset";
const MIG = path.join(__dirname, "..", "..", "src", "database", "migrations");

function sql(text, vars = {}) {
  const args = [DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  return execFileSync("psql", args, { input: text, encoding: "utf8" }).trim();
}
const file = (f) => execFileSync("psql", [DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", path.join(MIG, f)], { encoding: "utf8" });
const hit = (key, w = 600000, m = 10, c = 300000) => {
  const [total, , retry] = sql("select total_hits, reset_at, retry_after_ms from rate_limit_hit(:'k', :w, :m, :c)", { k: key, w, m, c }).split("|");
  return { total: Number(total), retryMs: Number(retry) };
};
const status = (key) => {
  const [b, r] = sql("select blocked, retry_after_ms from rate_limit_status(:'k')", { k: key }).split("|");
  return { blocked: b === "t", retryMs: Number(r) };
};

test.before(() => {
  if (skip) return;
  // Reset penuh: tabel DAN fungsi (drop table tidak menghapus fungsi; sisa fungsi versi baru
  // akan membuat migrasi lama gagal pada `create or replace`).
  sql("drop function if exists public.rate_limit_hit(text, integer, integer, integer); drop function if exists public.rate_limit_status(text); drop table if exists public.rate_limits cascade");
  file("20260728_create_rate_limits.sql");
  file("20261023_login_rate_limit_status.sql"); // upgrade dari fungsi lama
  file("20261023_login_rate_limit_status.sql"); // idempotent
});

test("SQL: 10 hit lolos, hit ke-11 memicu blokir 300000 ms, hit berikutnya tidak memperpanjang", { skip }, () => {
  for (let i = 1; i <= 10; i++) assert.equal(hit("sql:a").total, i);
  const blocked = hit("sql:a");
  assert.equal(blocked.total, 11);
  assert.ok(blocked.retryMs > 299_000 && blocked.retryMs <= 300_000, String(blocked.retryMs));
  const again = hit("sql:a");
  assert.equal(again.total, 11);
  assert.ok(again.retryMs <= blocked.retryMs, "cooldown tidak boleh bertambah");
});

test("SQL: status read-only (tidak insert/ubah baris), key tidak dikenal = tidak diblokir", { skip }, () => {
  const before = sql("select count(*) || ':' || coalesce(sum(hits),0) from rate_limits");
  for (let i = 0; i < 20; i++) status("sql:a");
  assert.equal(status("sql:tidak-ada").blocked, false);
  assert.equal(sql("select count(*) || ':' || coalesce(sum(hits),0) from rate_limits"), before);
  const s = status("sql:a");
  assert.equal(s.blocked, true);
  assert.ok(s.retryMs > 0 && s.retryMs <= 300_000);
});

test("SQL: kedaluwarsa — blocked_until di masa lalu → tidak diblokir; hit berikutnya memulai window baru", { skip }, () => {
  sql("update rate_limits set blocked_until = clock_timestamp() - interval '1 second' where key = 'sql:a'");
  assert.deepEqual(status("sql:a"), { blocked: false, retryMs: 0 });
  assert.equal(hit("sql:a").total, 1);
  // 1 detik sebelum habis masih diblokir:
  for (let i = 0; i < 10; i++) hit("sql:b");
  sql("update rate_limits set blocked_until = clock_timestamp() + interval '1 second' where key = 'sql:b'");
  const s = status("sql:b");
  assert.equal(s.blocked, true);
  assert.ok(s.retryMs >= 1 && s.retryMs <= 1000);
});

test("SQL: timestamp blokir disimpan sebagai timestamptz dan 300 detik dari saat blokir dipicu", { skip }, () => {
  for (let i = 0; i < 11; i++) hit("sql:c");
  assert.equal(sql("select data_type from information_schema.columns where table_name='rate_limits' and column_name='blocked_until'"), "timestamp with time zone");
  const secs = Number(sql("select round(extract(epoch from (blocked_until - clock_timestamp()))) from rate_limits where key='sql:c'"));
  assert.ok(secs >= 298 && secs <= 300, String(secs));
});

test("SQL: atomik di bawah beban — 40 hit paralel pada satu key (batas 10) → tepat hit 1..10 lolos, sisanya ditolak", { skip }, async () => {
  const run = () =>
    new Promise((resolve, reject) =>
      execFile("psql", [DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "select total_hits from rate_limit_hit('sql:par', 600000, 10, 300000)"], (e, out) => (e ? reject(e) : resolve(Number(out.trim()))))
    );
  const results = await Promise.all(Array.from({ length: 40 }, run));
  const passed = results.filter((t) => t <= 10).sort((a, b) => a - b);
  assert.deepEqual(passed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(results.filter((t) => t === 11).length, 30);
});

test("SQL: hak akses — anon/authenticated tidak boleh memanggil fungsi, RLS aktif tanpa policy", { skip }, () => {
  const priv = sql(`select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid,'execute') || has_function_privilege('authenticated', p.oid,'execute') || has_function_privilege('service_role', p.oid,'execute'), ',' order by p.proname) from pg_proc p where proname in ('rate_limit_hit','rate_limit_status')`);
  assert.equal(priv, "rate_limit_hit:falsefalsetrue,rate_limit_status:falsefalsetrue");
  assert.equal(sql("select relrowsecurity from pg_class where relname='rate_limits'"), "t");
  assert.equal(sql("select count(*) from pg_policies where tablename='rate_limits'"), "0");
});

// ---------------------------- lintas PROSES --------------------------------------------
function startInstance() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "childServer.js")], { env: { ...process.env }, stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.on("data", (d) => {
      const m = /PORT=(\d+)/.exec(String(d));
      if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}/api/v1` });
    });
    child.on("error", reject);
  });
}
const post = async (base, p, body, ip) => {
  const res = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test("LINTAS PROSES: blokir dipicu di instance A langsung berlaku di instance B; bertahan setelah A dimatikan", { skip }, async () => {
  const A = await startInstance();
  const B = await startInstance();
  try {
    assert.notEqual(A.child.pid, B.child.pid);
    const ip = "198.51.100.77";
    // 6 percobaan di A + 4 di B = 10 (kuota dibagi lewat DB, bukan memori tiap proses)
    for (let i = 0; i < 6; i++) assert.equal((await post(A.base, "/auth/login", { email: "budi@nutwear.id", password: "x" }, ip)).status, 401);
    for (let i = 0; i < 4; i++) assert.equal((await post(B.base, "/auth/login", { email: "budi@nutwear.id", password: "x" }, ip)).status, 401);
    const blocked = await post(A.base, "/auth/login", { email: "budi@nutwear.id", password: "x" }, ip);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.retryAfterSeconds, 300);

    const onB = await post(B.base, "/auth/login", { email: "budi@nutwear.id", password: "Benar123" }, ip);
    assert.equal(onB.status, 429, "instance B harus ikut memblokir (kredensial benar sekalipun)");
    assert.equal((await post(B.base, "/auth/login/status", { email: "budi@nutwear.id" }, ip)).body.data.blocked, true);

    A.child.kill("SIGKILL"); // proses yang memicu blokir mati — memori hilang
    await new Promise((r) => A.child.once("exit", r));
    const C = await startInstance(); // instance baru (cold start)
    try {
      const s = await post(C.base, "/auth/login/status", { email: "budi@nutwear.id" }, ip);
      assert.equal(s.body.data.blocked, true);
      assert.ok(s.body.data.retryAfterSeconds > 0 && s.body.data.retryAfterSeconds <= 300);
      assert.equal((await post(C.base, "/auth/login", { email: "budi@nutwear.id", password: "Benar123" }, ip)).status, 429);

      sql("update rate_limits set blocked_until = clock_timestamp() - interval '1 second' where key like 'login-acct:%'");
      assert.equal((await post(C.base, "/auth/login", { email: "budi@nutwear.id", password: "Benar123" }, ip)).status, 200);
    } finally {
      C.child.kill("SIGKILL");
    }
  } finally {
    A.child.kill("SIGKILL");
    B.child.kill("SIGKILL");
  }
});

test("LINTAS PROSES: database tidak bisa dihubungi → 503 (fail-closed), bukan login diizinkan", { skip }, async () => {
  const bad = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "childServer.js")], { env: { ...process.env, TEST_DATABASE_URL: "host=/tmp port=1 user=nobody dbname=none connect_timeout=2" }, stdio: ["ignore", "pipe", "ignore"] });
    child.stdout.on("data", (d) => { const m = /PORT=(\d+)/.exec(String(d)); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}/api/v1` }); });
    child.on("error", reject);
  });
  try {
    const r = await post(bad.base, "/auth/login", { email: "budi@nutwear.id", password: "Benar123" }, "198.51.100.88");
    assert.equal(r.status, 503);
    assert.equal(r.body.data, undefined);
  } finally {
    bad.child.kill("SIGKILL");
  }
});
