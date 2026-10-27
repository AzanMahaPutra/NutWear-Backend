/**
 * UPDATE 11 — Tes rate limit login dengan penyimpanan TERPUSAT (RATE_LIMIT_STORE=supabase,
 * yaitu mode production/Vercel). Jalankan: `npm test`.
 *
 * Yang diuji: percobaan sampai batas, blokir 300 detik, Retry-After, refresh / tab baru
 * (status dibaca ulang dari backend), kedaluwarsa, login setelah blokir berakhir, kegagalan
 * penyimpanan (fail-closed), tidak ada data sensitif di tabel, tidak membedakan email
 * terdaftar/tidak, tidak ada endpoint reset, header proxy palsu, dan clock skew.
 *
 * CATATAN KEJUJURAN: database di sini adalah FAKE di memori proses uji (lihat
 * fakeLoginBackend.js) yang meniru SQL. Tes ini membuktikan kode backend (store, limiter,
 * controller, cookie) — BUKAN perilaku SQL asli dan BUKAN konsistensi lintas-proses.
 * Itu dibuktikan oleh tests/integration/loginRateLimit.postgres.test.js pada PostgreSQL.
 */
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://fake.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.RATE_LIMIT_STORE = "supabase";
process.env.TRUST_PROXY = "1"; // supaya tiap tes bisa memakai IP sendiri lewat X-Forwarded-For
delete process.env.VERCEL;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { createFakeLoginBackend } = require("./fakeLoginBackend");

const PASSWORD = "Benar123";
const accounts = [{ id: "30000000-0000-4000-8000-000000000001", email: "budi@nutwear.id", password: PASSWORD, nama: "Budi" }];
const { fakeFetch, state } = createFakeLoginBackend({ accounts });

const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;

const app = require("../src/app");
const { LOGIN_RATE_LIMIT_CONFIG } = require("../src/middlewares/rateLimiter");

function listen(application) {
  const server = http.createServer(application);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/api/v1` })));
}

let primary;
test.before(async () => {
  primary = await listen(app);
});
test.after(() => new Promise((r) => primary.server.close(r)));
test.beforeEach(() => {
  state.rpcMode = "ok";
  state.dbClockSkewMs = 0;
});
test.afterEach(() => test.mock.timers.reset());

let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;

/** Satu "browser": cookie jar + IP. Dua tab di browser yang sama berbagi jar yang sama. */
function browser({ ip = nextIp(), base = () => primary.base } = {}) {
  const jar = new Map();
  async function request(method, urlPath, body, extraHeaders = {}) {
    const headers = { "content-type": "application/json", "x-forwarded-for": ip, ...extraHeaders };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await realFetch(`${base()}${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.getSetCookie();
    for (const c of setCookie) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers, setCookie, text };
  }
  return {
    ip,
    jar,
    request,
    login: (email, password) => request("POST", "/auth/login", { email, password }),
    status: (email) => request("POST", "/auth/login/status", email === undefined ? {} : { email }),
  };
}

const wrong = (b, email = "budi@nutwear.id") => b.login(email, "salah-password");
async function attempt(b, n, email) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await wrong(b, email));
  return out;
}
const startFakeClock = () => test.mock.timers.enable({ apis: ["Date"], now: Date.now() });
const tick = (ms) => test.mock.timers.tick(ms);

// ---------------------------------------------------------------------------------------
test("konfigurasi: blokir 300 detik; batas percobaan TIDAK diubah (10/akun, 30/IP, window 10 menit)", () => {
  assert.equal(LOGIN_RATE_LIMIT_CONFIG.cooldownMs, 300_000);
  assert.equal(LOGIN_RATE_LIMIT_CONFIG.maxPerAccount, 10);
  assert.equal(LOGIN_RATE_LIMIT_CONFIG.maxPerIp, 30);
  assert.equal(LOGIN_RATE_LIMIT_CONFIG.windowMs, 600_000);
});

test("percobaan gagal sampai batas → percobaan ke-11 diblokir 429 selama 300 detik", async () => {
  const b = browser();
  const first10 = await attempt(b, 10);
  assert.deepEqual(first10.map((r) => r.status), Array(10).fill(401));
  assert.equal(first10[0].body.message, "Email atau password salah");

  const blocked = await wrong(b);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.success, false);
  assert.equal(blocked.body.code, "LOGIN_RATE_LIMITED");
  assert.equal(blocked.body.retryAfterSeconds, 300);
  assert.equal(blocked.headers.get("retry-after"), "300");
  assert.match(blocked.body.message, /5 menit/);
  assert.equal(blocked.headers.get("cache-control"), "no-store");

  // Parameter cooldown yang dikirim ke fungsi SQL juga 300000 ms.
  const hits = state.rpcCalls.filter((c) => c.fn === "rate_limit_hit" && c.args.p_key.startsWith("login-acct:"));
  assert.ok(hits.length >= 11);
  assert.ok(hits.every((c) => c.args.p_cooldown_ms === 300_000 && c.args.p_max === 10));
});

test("respons 429 tidak membocorkan batas/sisa kuota (tanpa header RateLimit-*) dan tidak menyebut limiter", async () => {
  const b = browser();
  await attempt(b, 10);
  const r = await wrong(b);
  assert.equal(r.status, 429);
  for (const h of ["ratelimit", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "ratelimit-policy", "x-ratelimit-limit"]) {
    assert.equal(r.headers.get(h), null, h);
  }
  assert.deepEqual(Object.keys(r.body).sort(), ["code", "message", "retryAfterSeconds", "success"]);
  assert.doesNotMatch(r.text, /login-acct|login-ip|rate_limit_hit|rate_limit_status|rate_limits|supabase/i); // `code` publik LOGIN_RATE_LIMITED memang ada
});

test("selama blokir: kredensial BENAR pun ditolak 429, Supabase Auth tidak dipanggil, blokir tidak diperpanjang", async () => {
  startFakeClock();
  const b = browser();
  await attempt(b, 10);
  const blocked = await wrong(b);
  assert.equal(blocked.body.retryAfterSeconds, 300);

  const authBefore = state.authCalls;
  tick(60_000);
  const withCorrectPassword = await b.login("budi@nutwear.id", PASSWORD);
  assert.equal(withCorrectPassword.status, 429);
  assert.equal(withCorrectPassword.body.retryAfterSeconds, 240); // berkurang, TIDAK reset ke 300
  assert.equal(state.authCalls, authBefore, "request yang diblokir tidak boleh menyentuh Supabase Auth");

  tick(120_000);
  const again = await wrong(b);
  assert.equal(again.body.retryAfterSeconds, 120);
});

test("refresh halaman: status blokir diperoleh kembali dari backend (akun, lewat cookie petunjuk) tanpa state di client", async () => {
  startFakeClock();
  const b = browser();
  await attempt(b, 10);
  const blocked = await wrong(b);
  assert.equal(blocked.status, 429);

  // Cookie petunjuk: hanya hash email 32 hex, httpOnly, umur ≤ 300 detik.
  const hint = blocked.setCookie.find((c) => c.startsWith("nutwear_login_block="));
  assert.ok(hint, "cookie petunjuk harus di-set");
  assert.match(hint, /^nutwear_login_block=[a-f0-9]{32};/);
  assert.match(hint, /HttpOnly/i);
  assert.match(hint, /Max-Age=300/);
  assert.doesNotMatch(hint, /budi|nutwear\.id|salah-password/i);

  tick(45_000);
  // "Refresh": request baru, TANPA email di body — hanya cookie browser.
  const afterRefresh = await b.status();
  assert.equal(afterRefresh.status, 200);
  assert.deepEqual(afterRefresh.body.data, { blocked: true, retryAfterSeconds: 255 });
});

test("tab baru: tab kedua (cookie sama) langsung melihat blokir yang dipicu di tab pertama", async () => {
  startFakeClock();
  const tab1 = browser();
  await attempt(tab1, 10);
  await wrong(tab1);
  tick(100_000);

  const tab2 = browser({ ip: tab1.ip });
  tab2.jar.set("nutwear_login_block", tab1.jar.get("nutwear_login_block")); // cookie dibagi antar tab
  const s = await tab2.status();
  assert.deepEqual(s.body.data, { blocked: true, retryAfterSeconds: 200 });
});

test("tanpa cookie (mis. cookie pihak-ketiga diblokir): status tetap ditemukan begitu email diketik", async () => {
  startFakeClock();
  const b = browser();
  await attempt(b, 10);
  await wrong(b);
  const noCookie = browser({ ip: b.ip });
  assert.deepEqual((await noCookie.status()).body.data, { blocked: false, retryAfterSeconds: 0 }); // email belum diketahui
  assert.deepEqual((await noCookie.status("BUDI@nutwear.id  ")).body.data, { blocked: true, retryAfterSeconds: 300 }); // normalisasi sama dengan /login
  // Email lain dari IP yang sama TIDAK ikut terblokir (blokir per akun).
  assert.deepEqual((await noCookie.status("lain@nutwear.id")).body.data, { blocked: false, retryAfterSeconds: 0 });
  assert.equal((await noCookie.login("budi@nutwear.id", PASSWORD)).status, 429);
});

test("endpoint status read-only: tidak menambah hit dan tidak memperpanjang/mereset blokir", async () => {
  startFakeClock();
  const b = browser();
  await attempt(b, 10);
  await wrong(b);
  const snapshot = JSON.stringify([...state.rateLimits]);
  for (let i = 0; i < 25; i++) await b.status();
  assert.equal(JSON.stringify([...state.rateLimits]), snapshot, "baris rate_limits tidak boleh berubah oleh /login/status");

  tick(10_000);
  assert.equal((await b.status()).body.data.retryAfterSeconds, 290);

  // Pemanggilan status pada pengguna yang BELUM diblokir tidak memakan kuota login.
  const fresh = browser();
  for (let i = 0; i < 25; i++) await fresh.status("budi@nutwear.id");
  const ok = await attempt(fresh, 10);
  assert.deepEqual(ok.map((r) => r.status), Array(10).fill(401));
});

test("kedaluwarsa: tepat sebelum 300 detik masih diblokir; sesudahnya login dengan password benar berhasil", async () => {
  startFakeClock();
  const b = browser();
  await attempt(b, 10);
  await wrong(b);

  tick(299_000);
  assert.deepEqual((await b.status()).body.data, { blocked: true, retryAfterSeconds: 1 });
  assert.equal((await b.login("budi@nutwear.id", PASSWORD)).status, 429);

  tick(2_000); // total 301 detik
  assert.deepEqual((await b.status()).body.data, { blocked: false, retryAfterSeconds: 0 });
  const ok = await b.login("budi@nutwear.id", PASSWORD);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.accessToken, `access-${accounts[0].id}`);
  assert.equal(ok.body.data.user.email, "budi@nutwear.id");
});

test("setelah blokir berakhir kuota mulai dari awal (bukan langsung diblokir lagi)", async () => {
  startFakeClock();
  const b = browser();
  await attempt(b, 10);
  await wrong(b);
  tick(301_000);
  const next = await attempt(b, 10);
  assert.deepEqual(next.map((r) => r.status), Array(10).fill(401));
  assert.equal((await wrong(b)).status, 429); // dan baru terblokir lagi di percobaan ke-11
});

test("limiter per IP: banyak email berbeda dari satu IP (password spraying) diblokir di percobaan ke-31", async () => {
  startFakeClock();
  const b = browser();
  for (let i = 1; i <= 30; i++) {
    const r = await b.login(`korban${i}@mail.com`, "x-password");
    assert.equal(r.status, 401, `percobaan ${i}`);
  }
  const blocked = await b.login("korban31@mail.com", "x-password");
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.retryAfterSeconds, 300);

  // Tanpa email & tanpa cookie pun, status berdasarkan IP menunjukkan blokir.
  const refreshed = browser({ ip: b.ip });
  assert.deepEqual((await refreshed.status()).body.data, { blocked: true, retryAfterSeconds: 300 });
  // Email yang BELUM pernah dicoba tetap ditolak karena IP-nya diblokir.
  assert.equal((await refreshed.login("budi@nutwear.id", PASSWORD)).status, 429);
  tick(301_000);
  assert.equal((await refreshed.login("budi@nutwear.id", PASSWORD)).status, 200);
});

test("blokir akun terikat IP: IP lain dengan email yang sama tidak ikut diblokir (perilaku yang disengaja)", async () => {
  const a = browser();
  await attempt(a, 10);
  assert.equal((await wrong(a)).status, 429);
  const other = browser(); // IP berbeda
  assert.equal((await wrong(other)).status, 401);
  assert.deepEqual((await other.status("budi@nutwear.id")).body.data, { blocked: false, retryAfterSeconds: 0 });
});

test("header X-Forwarded-For palsu di depan rantai tidak memberi bucket baru (hanya hop tepercaya yang dipakai)", async () => {
  const b = browser();
  const results = [];
  for (let i = 0; i < 11; i++) {
    results.push((await b.request("POST", "/auth/login", { email: "budi@nutwear.id", password: "salah" }, { "x-forwarded-for": `203.0.113.${i + 1}, ${b.ip}` })).status);
  }
  assert.deepEqual(results, [...Array(10).fill(401), 429]);
});

test("tidak membedakan email terdaftar dan tidak terdaftar (429 dan status identik)", async () => {
  const normalize = (r) => ({ status: r.status, body: { ...r.body, retryAfterSeconds: "n" }, retryAfter: r.headers.get("retry-after") });
  const reg = browser();
  const unreg = browser();
  await attempt(reg, 10, "budi@nutwear.id");
  await attempt(unreg, 10, "tidak-ada@nutwear.id");
  const r1 = await wrong(reg, "budi@nutwear.id");
  const r2 = await wrong(unreg, "tidak-ada@nutwear.id");
  assert.deepEqual(normalize(r1), normalize(r2));
  assert.deepEqual((await reg.status()).body, (await unreg.status()).body);
  assert.deepEqual((await reg.status("budi@nutwear.id")).body, (await unreg.status("tidak-ada@nutwear.id")).body);
});

test("tabel rate_limits tidak berisi password, token, atau email mentah", async () => {
  const b = browser();
  await b.login("budi@nutwear.id", "Rahasia!SuperUnik-123");
  await b.login("rahasia.user@mail.com", "Rahasia!SuperUnik-123");
  await b.login("budi@nutwear.id", PASSWORD); // sukses → token diterbitkan
  const dump = JSON.stringify([...state.rateLimits]) + JSON.stringify(state.rpcCalls);
  assert.doesNotMatch(dump, /Rahasia|SuperUnik|salah-password|Benar123|access-|refresh-|token/i);
  assert.doesNotMatch(dump, /budi|nutwear\.id|rahasia\.user|mail\.com/i);
  for (const key of state.rateLimits.keys()) assert.match(key, /^login-(ip:[0-9a-f.:/]+|acct:[0-9a-f.:/]+:[a-f0-9]{32})$/);
});

test("tidak ada endpoint untuk mereset/membuka blokir (publik maupun lainnya)", async () => {
  const b = browser();
  await attempt(b, 10);
  assert.equal((await wrong(b)).status, 429);
  const probes = [
    ["POST", "/auth/login/reset"],
    ["POST", "/auth/login/unblock"],
    ["POST", "/auth/login/clear"],
    ["DELETE", "/auth/login/status"],
    ["DELETE", "/auth/login"],
    ["PUT", "/auth/login/status"],
    ["POST", "/auth/rate-limit/reset"],
    ["POST", "/auth/reset-rate-limit"],
  ];
  for (const [m, p] of probes) assert.equal((await b.request(m, p, { email: "budi@nutwear.id" })).status, 404, `${m} ${p}`);
  assert.equal((await b.status()).body.data.blocked, true);
});

test("cookie petunjuk palsu/rusak diabaikan dan tidak berguna", async () => {
  const b = browser();
  b.jar.set("nutwear_login_block", "bukan-hex-sama-sekali!!");
  assert.equal((await b.status()).status, 200);
  assert.deepEqual((await b.status()).body.data, { blocked: false, retryAfterSeconds: 0 });
  b.jar.set("nutwear_login_block", "a".repeat(32)); // hex valid tapi key-nya (IP kita + hash itu) tidak diblokir
  assert.deepEqual((await b.status()).body.data, { blocked: false, retryAfterSeconds: 0 });
});

test("validasi: email non-string pada status ditolak 422; email terlalu panjang ditolak", async () => {
  const b = browser();
  assert.equal((await b.request("POST", "/auth/login/status", { email: { $ne: 1 } })).status, 422);
  assert.equal((await b.request("POST", "/auth/login/status", { email: "a".repeat(300) })).status, 422);
  assert.equal((await b.request("POST", "/auth/login/status", {})).status, 200);
});

test("clock skew: jam database beda 2 jam dari jam instance → sisa waktu tetap 300 detik (dihitung di DB)", async () => {
  for (const skew of [7_200_000, -7_200_000]) {
    state.dbClockSkewMs = skew;
    const b = browser();
    await attempt(b, 10);
    const r = await wrong(b);
    assert.equal(r.status, 429, `skew ${skew}`);
    assert.equal(r.body.retryAfterSeconds, 300, `skew ${skew}`);
    assert.equal((await b.status()).body.data.retryAfterSeconds, 300, `status skew ${skew}`);
  }
});

test("instance lain (modul baru, memori terpisah) membaca blokir yang sama dari penyimpanan terpusat", async () => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(__dirname, "..", "src") + path.sep)) delete require.cache[k];
  const second = await listen(require("../src/app"));
  try {
    assert.notEqual(require("../src/app"), app, "harus instance aplikasi yang berbeda");
    const onA = browser();
    await attempt(onA, 10);
    assert.equal((await wrong(onA)).status, 429);

    const onB = browser({ ip: onA.ip, base: () => second.base });
    assert.equal((await onB.login("budi@nutwear.id", PASSWORD)).status, 429);
    assert.deepEqual((await onB.status("budi@nutwear.id")).body.data, { blocked: true, retryAfterSeconds: 300 });
  } finally {
    await new Promise((r) => second.server.close(r));
  }
});

// ---------------------- Kegagalan penyimpanan (fail-closed) ----------------------------
for (const mode of ["http500", "network", "missing", "malformed"]) {
  test(`penyimpanan gagal (${mode}): login DITOLAK 503 — tidak diam-diam diizinkan, Supabase Auth tidak dipanggil`, async () => {
    const b = browser();
    state.rpcMode = mode;
    const authBefore = state.authCalls;
    const r = await b.login("budi@nutwear.id", PASSWORD); // kredensial BENAR
    assert.equal(r.status, 503);
    assert.equal(r.body.success, false);
    assert.match(r.body.message, /tidak tersedia sementara/i);
    assert.equal(state.authCalls, authBefore, "login tidak boleh dilanjutkan ketika perlindungan gagal");
    assert.doesNotMatch(r.text, /rate_limit|supabase|PGRST|XX000|connection refused|login-acct|fetch failed/i);
    assert.equal(r.body.accessToken, undefined);
    assert.equal(r.body.data, undefined);
  });
}

test("penyimpanan gagal: tidak ada fallback in-memory — setelah pulih, hitungan tetap dari database", async () => {
  const b = browser();
  await attempt(b, 5);
  state.rpcMode = "http500";
  for (let i = 0; i < 20; i++) assert.equal((await wrong(b)).status, 503); // gagal, tidak menghitung di memori
  state.rpcMode = "ok";
  const rest = await attempt(b, 5); // total 10 percobaan tercatat di DB
  assert.deepEqual(rest.map((r) => r.status), Array(5).fill(401));
  assert.equal((await wrong(b)).status, 429);
});

test("penyimpanan gagal pada endpoint status: 503 generik (frontend memperlakukan sebagai 'tidak diketahui')", async () => {
  const b = browser();
  state.rpcMode = "http500";
  const r = await b.status("budi@nutwear.id");
  assert.equal(r.status, 503);
  assert.doesNotMatch(r.text, /rate_limit|supabase|PGRST|XX000/i);
});

test("fungsi SQL versi lama (tanpa retry_after_ms) tetap menghasilkan sisa waktu benar lewat reset_at", async () => {
  // Menyimulasikan deploy kode sebelum migrasi: respons rate_limit_hit tanpa retry_after_ms.
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const res = await original(input, init);
    if (String(typeof input === "string" ? input : input.url).includes("/rpc/rate_limit_hit")) {
      const [row] = await res.json();
      delete row.retry_after_ms;
      return new Response(JSON.stringify([row]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return res;
  };
  try {
    const b = browser();
    await attempt(b, 10);
    const r = await wrong(b);
    assert.equal(r.status, 429);
    assert.ok(r.body.retryAfterSeconds >= 299 && r.body.retryAfterSeconds <= 300, String(r.body.retryAfterSeconds));
  } finally {
    globalThis.fetch = original;
  }
});
