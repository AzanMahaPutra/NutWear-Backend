/**
 * UPDATE 11 — Rate limit login pada mode MEMORY (default development/test lokal).
 * Aturan identik dengan mode terpusat; bedanya state hanya di memori proses ini, jadi
 * TIDAK dibagikan antar proses/instance dan hilang jika proses restart (sengaja, hanya lokal).
 */
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://fake.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.SUPABASE_ANON_KEY = "anon-test";
delete process.env.RATE_LIMIT_STORE;
delete process.env.VERCEL;
process.env.TRUST_PROXY = "1";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createFakeLoginBackend } = require("./fakeLoginBackend");

const accounts = [{ id: "30000000-0000-4000-8000-000000000001", email: "budi@nutwear.id", password: "Benar123", nama: "Budi" }];
const { fakeFetch, state } = createFakeLoginBackend({ accounts });
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;
const app = require("../src/app");
const env = require("../src/config/env");

let server, base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
test.after(() => new Promise((r) => server.close(r)));
test.afterEach(() => test.mock.timers.reset());

let n = 0;
async function call(ip, urlPath, body) {
  const res = await realFetch(`${base}${urlPath}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json(), retryAfter: res.headers.get("retry-after") };
}

test("mode memory aktif dan tidak memanggil database rate limit", () => {
  assert.equal(env.rateLimitStore, "memory");
});

test("memory: blokir 300 detik setelah 10 gagal, status bisa ditanyakan ulang, berakhir tepat waktu", async () => {
  test.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const ip = `198.51.100.${++n}`;
  for (let i = 0; i < 10; i++) assert.equal((await call(ip, "/auth/login", { email: "budi@nutwear.id", password: "x" })).status, 401);
  const blocked = await call(ip, "/auth/login", { email: "budi@nutwear.id", password: "x" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.retryAfterSeconds, 300);
  assert.equal(blocked.retryAfter, "300");

  test.mock.timers.tick(100_000);
  assert.deepEqual((await call(ip, "/auth/login/status", { email: "budi@nutwear.id" })).body.data, { blocked: true, retryAfterSeconds: 200 });

  test.mock.timers.tick(201_000);
  assert.deepEqual((await call(ip, "/auth/login/status", { email: "budi@nutwear.id" })).body.data, { blocked: false, retryAfterSeconds: 0 });
  const ok = await call(ip, "/auth/login", { email: "budi@nutwear.id", password: "Benar123" });
  assert.equal(ok.status, 200);
  assert.equal(state.rpcCalls.length, 0, "mode memory tidak boleh memanggil RPC database");
});

test("memory: status read-only tidak menghabiskan kuota", async () => {
  const ip = `198.51.100.${++n}`;
  for (let i = 0; i < 40; i++) await call(ip, "/auth/login/status", { email: "budi@nutwear.id" });
  for (let i = 0; i < 10; i++) assert.equal((await call(ip, "/auth/login", { email: "budi@nutwear.id", password: "x" })).status, 401);
  assert.equal((await call(ip, "/auth/login", { email: "budi@nutwear.id", password: "x" })).status, 429);
});
