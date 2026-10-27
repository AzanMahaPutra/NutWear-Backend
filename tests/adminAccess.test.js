/**
 * UPDATE 10 — Otorisasi backend untuk SELURUH endpoint admin.
 * Pastikan tampilan 404 di frontend bukan satu-satunya pagar: setiap API admin
 * harus menolak (a) tanpa token -> 401, (b) token palsu -> 401, (c) customer -> 403,
 * dan hanya admin yang lolos autentikasi/otorisasi. Jalankan: `npm test`.
 */
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://fake.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.SUPABASE_ANON_KEY = "anon-test";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createFakeBackend } = require("./fakePostgrest");

const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = { id: "00000000-0000-4000-8000-000000000001", email: "admin@nutwear.id", nama_lengkap: "Admin Budi", role: "admin", status: "aktif" };
const CUSTOMER = { id: uid(1), email: "budi@mail.com", nama_lengkap: "Budi", no_hp: "0812", role: "customer", status: "aktif" };

const { fakeFetch } = createFakeBackend({
  tokens: {
    "admin-token": { id: ADMIN.id, email: ADMIN.email },
    "customer-token": { id: CUSTOMER.id, email: CUSTOMER.email },
  },
  users: [ADMIN, CUSTOMER],
});
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;

const app = require("../src/app");
let server;
let base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
test.after(() => new Promise((r) => server.close(r)));

const U = "20000000-0000-4000-8000-000000000001";
// Daftar lengkap endpoint khusus admin (hasil audit routes/*.js).
const ADMIN_ENDPOINTS = [
  ["PATCH", "/banners/reorder"], ["POST", "/banners"], ["PUT", `/banners/${U}`], ["DELETE", `/banners/${U}`],
  ["PATCH", "/categories/reorder"], ["POST", "/categories"], ["PUT", `/categories/${U}`], ["DELETE", `/categories/${U}`],
  ["PATCH", "/hero-banners/reorder"], ["POST", "/hero-banners"], ["PUT", `/hero-banners/${U}`], ["DELETE", `/hero-banners/${U}`],
  ["GET", "/admin/dashboard/summary"],
  ["GET", "/orders"], ["DELETE", "/orders"], ["GET", "/orders/search-suggestions"], ["GET", `/orders/${U}`],
  ["DELETE", `/orders/${U}`], ["PATCH", `/orders/${U}/status`],
  ["POST", "/products"], ["PUT", `/products/${U}`], ["DELETE", `/products/${U}`],
  ["POST", `/products/${U}/variants`], ["PUT", `/products/variants/${U}`], ["DELETE", `/products/variants/${U}`],
  ["POST", `/products/${U}/images`], ["DELETE", `/products/images/${U}`],
  ["POST", `/products/${U}/features`], ["PUT", `/products/features/${U}`], ["DELETE", `/products/features/${U}`],
  ["POST", `/products/${U}/pairs`], ["DELETE", `/products/${U}/pairs/${U}`],
  ["POST", `/products/images/${U}/pairs`], ["DELETE", `/products/images/${U}/pairs/${U}`],
  ["GET", "/reviews"], ["PATCH", `/reviews/${U}/status`], ["POST", `/reviews/${U}/reply`],
  ["DELETE", `/reviews/${U}/reply`], ["DELETE", `/reviews/${U}`],
  ["GET", "/stock/settings"], ["PUT", "/stock/settings"], ["GET", "/stock/low-stock"], ["GET", "/stock/inventory"],
  ["GET", "/stock/inventory/products"], ["GET", `/stock/inventory/products/${U}`],
  ["PATCH", `/stock/${U}/adjust`], ["PATCH", `/stock/${U}/set`], ["GET", `/stock/${U}/logs`],
  ["GET", "/transaction-reports"], ["GET", "/transaction-reports/export"], ["GET", "/transaction-reports/analytics"],
  ["POST", "/transaction-reports/export-csv"],
  ["GET", "/unban-requests"], ["PATCH", `/unban-requests/${U}/approve`], ["PATCH", `/unban-requests/${U}/reject`],
  ["DELETE", `/unban-requests/${U}`],
  ["GET", "/users"], ["PATCH", `/users/${U}/ban`],
];

async function call(method, path, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = await realFetch(`${base}${path}`, { method, headers });
  let body = null;
  try { body = await res.json(); } catch { /* bukan JSON */ }
  return { status: res.status, body };
}

test(`tanpa Authorization header -> 401 untuk ${ADMIN_ENDPOINTS.length} endpoint admin`, async () => {
  for (const [m, p] of ADMIN_ENDPOINTS) {
    const r = await call(m, p);
    assert.equal(r.status, 401, `${m} ${p} -> ${r.status}`);
  }
});

test("header bukan Bearer / token palsu / token kosong -> 401", async () => {
  for (const [m, p] of ADMIN_ENDPOINTS) {
    for (const token of ["bukan-token-valid", "undefined", ""]) {
      const r = await call(m, p, token || "x".repeat(8));
      assert.equal(r.status, 401, `${m} ${p} token=${token || "(kosong)"} -> ${r.status}`);
    }
    const res = await realFetch(`${base}${p}`, { method: m, headers: { authorization: "Basic YWRtaW46YWRtaW4=" } });
    assert.equal(res.status, 401, `${m} ${p} skema Basic -> ${res.status}`);
  }
});

test("login sebagai customer (non-admin) -> 403 untuk semua endpoint admin", async () => {
  for (const [m, p] of ADMIN_ENDPOINTS) {
    const r = await call(m, p, "customer-token");
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
  }
});

test("login sebagai admin -> lolos autentikasi & otorisasi (bukan 401/403)", async () => {
  for (const [m, p] of ADMIN_ENDPOINTS) {
    const r = await call(m, p, "admin-token");
    assert.ok(![401, 403].includes(r.status), `${m} ${p} -> ${r.status} ${JSON.stringify(r.body)}`);
  }
});

test("admin sah tetap dapat membaca endpoint admin dengan data nyata (200)", async () => {
  const r = await call("GET", "/users", "admin-token");
  assert.equal(r.status, 200);
});

test("endpoint yang tidak terdaftar tetap 404 JSON standar, termasuk path /admin yang tidak ada", async () => {
  for (const p of ["/tidak-ada", "/admin", "/admin/tidak-ada"]) {
    const r = await call("GET", p);
    assert.equal(r.status, 404, `GET ${p} -> ${r.status}`);
    assert.equal(r.body.success, false);
  }
});

test("endpoint publik tidak ikut terkunci (GET produk/kategori/banner/hero-banner)", async () => {
  for (const p of ["/categories", "/banners", "/hero-banners", "/health"]) {
    const r = await call("GET", p);
    assert.ok(![401, 403].includes(r.status), `GET ${p} -> ${r.status}`);
  }
});
