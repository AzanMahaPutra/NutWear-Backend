/**
 * UPDATE 11 — Tanpa konfigurasi trusted proxy (TRUST_PROXY/VERCEL tidak diset), header
 * X-Forwarded-For dari client TIDAK boleh dipercaya: IP yang dipakai = alamat socket.
 * File terpisah karena `trust proxy` dibaca sekali saat aplikasi dimuat.
 */
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://fake.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.SUPABASE_ANON_KEY = "anon-test";
delete process.env.RATE_LIMIT_STORE;
delete process.env.TRUST_PROXY;
delete process.env.VERCEL;

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createFakeLoginBackend } = require("./fakeLoginBackend");

const { fakeFetch } = createFakeLoginBackend({ accounts: [] });
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

test("trust proxy mati: mengganti X-Forwarded-For tiap request tidak menghindari blokir", async () => {
  assert.equal(env.trustProxy, false);
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const res = await realFetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${i + 1}` },
      body: JSON.stringify({ email: "budi@nutwear.id", password: "x" }),
    });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses, [...Array(10).fill(401), 429]);
});

test("trust proxy mati: status blokir juga tidak bisa 'dipindah' dengan header palsu", async () => {
  const res = await realFetch(`${base}/auth/login/status`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "8.8.8.8" },
    body: JSON.stringify({ email: "budi@nutwear.id" }),
  });
  assert.deepEqual((await res.json()).data, { blocked: true, retryAfterSeconds: 300 });
});
