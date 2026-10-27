/**
 * UPDATE 09 — Tes Permohonan Unban (admin):
 *   GET /api/v1/unban-requests?search=&status=&page=&limit=
 *   DELETE /api/v1/unban-requests/:id
 * Jalankan: `npm test`.
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
const rid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = { id: "00000000-0000-4000-8000-000000000001", email: "admin@nutwear.id", nama_lengkap: "Admin Budi", role: "admin", status: "aktif" };
const user = (n, nama, email, extra = {}) => ({ id: uid(n), nama_lengkap: nama, email, no_hp: "0812", role: "customer", status: "banned", ...extra });

const users = [
  ADMIN,
  user(1, "Budi Santoso", "budi.santoso@mail.com"),
  user(2, "Siti Aisyah", "SITI@Example.COM"),
  user(3, "100%_Real", "persen@mail.com"),
  user(4, 'O"Brien, (Jr)', "obrien@mail.com"),
];
for (let n = 10; n <= 21; n++) users.push(user(n, `Pemohon ${n}`, `pemohon${n}@toko.id`));

const req = (n, userId, status, extra = {}) => ({
  id: rid(n),
  user_id: userId,
  banned_reason_snapshot: "Spam Review",
  request_reason: `Mohon dibuka ${n}`,
  status,
  created_at: new Date(Date.UTC(2026, 5, 1, 0, n)).toISOString(), // n besar = lebih baru
  processed_at: status === "menunggu" ? null : "2026-06-02T00:00:00Z",
  ...extra,
});
const unbanRequests = [
  req(1, uid(1), "menunggu"),
  req(2, uid(2), "disetujui"),
  req(3, uid(3), "ditolak"),
  req(4, uid(4), "menunggu"),
  req(5, uid(1), "ditolak"), // Budi punya 2 permohonan
];
for (let n = 10; n <= 21; n++) unbanRequests.push(req(n, uid(n), n % 2 ? "ditolak" : "menunggu"));
const TOTAL = unbanRequests.length; // 17
const snapshot = (x) => JSON.parse(JSON.stringify(x));
const usersBefore = snapshot(users);

const { fakeFetch, state } = createFakeBackend({
  tokens: {
    "admin-token": { id: ADMIN.id, email: ADMIN.email },
    "customer-token": { id: uid(1), email: "budi.santoso@mail.com" },
  },
  users,
  unbanRequests,
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

async function call(method, path, token = "admin-token") {
  const res = await realFetch(`${base}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
}
const list = (params = {}, token) => call("GET", `/unban-requests?${new URLSearchParams(params)}`, token);
const del = (id, token) => call("DELETE", `/unban-requests/${id}`, token);
const names = (r) => r.body.data.map((x) => x.namaUser);
const ids = (r) => r.body.data.map((x) => x.id);

// ---------------- Search / filter / pagination ----------------
test("tanpa search: semua permohonan, terbaru dulu, identitas pemohon ikut", async () => {
  const r = await list();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.meta, { page: 1, limit: 10, total: TOTAL, totalPages: 2 });
  assert.equal(r.body.data[0].id, rid(21));
  assert.equal(r.body.data[0].namaUser, "Pemohon 21");
  assert.equal(r.body.data[0].email, "pemohon21@toko.id");
});

test("cari nama/username (sebagian kata) dan email", async () => {
  const byName = await list({ search: "santoso" });
  assert.deepEqual(ids(byName).sort(), [rid(1), rid(5)]);
  assert.equal(byName.body.meta.total, 2);
  const byEmail = await list({ search: "pemohon15@" });
  assert.deepEqual(names(byEmail), ["Pemohon 15"]);
  const byDomain = await list({ search: "example.com" });
  assert.deepEqual(names(byDomain), ["Siti Aisyah"]);
});

test("case-insensitive untuk nama dan email", async () => {
  for (const q of ["BUDI", "budi", "bUdI SaNtOsO"]) assert.deepEqual(ids(await list({ search: q })).sort(), [rid(1), rid(5)], q);
  assert.deepEqual(names(await list({ search: "siti@example.com" })), ["Siti Aisyah"]);
  assert.deepEqual(names(await list({ search: "SITI@EXAMPLE.COM" })), ["Siti Aisyah"]);
});

test("admin yang namanya cocok tidak mempengaruhi hasil; hasil kosong total 0", async () => {
  assert.deepEqual(ids(await list({ search: "budi" })).sort(), [rid(1), rid(5)]);
  const r = await list({ search: "tidak-ada" });
  assert.deepEqual(r.body.data, []);
  assert.deepEqual(r.body.meta, { page: 1, limit: 10, total: 0, totalPages: 1 });
});

test("filter status dipertahankan, termasuk digabung dengan search", async () => {
  const wait = await list({ status: "menunggu", limit: "100" });
  assert.ok(wait.body.data.every((x) => x.status === "menunggu"));
  assert.equal(wait.body.meta.total, unbanRequests.filter((x) => x.status === "menunggu").length);
  const both = await list({ search: "budi", status: "ditolak" });
  assert.deepEqual(ids(both), [rid(5)]);
  assert.equal(both.body.meta.total, 1);
  const none = await list({ search: "siti", status: "menunggu" });
  assert.equal(none.body.meta.total, 0);
});

test("pagination: halaman tidak tumpang tindih & total konsisten (tanpa dan dengan search/status)", async () => {
  const seen = [];
  for (const p of [1, 2]) {
    const r = await list({ page: String(p), limit: "10" });
    assert.equal(r.body.meta.total, TOTAL);
    seen.push(...ids(r));
  }
  assert.equal(new Set(seen).size, TOTAL);

  const s1 = await list({ search: "pemohon", status: "menunggu", limit: "3", page: "1" });
  const s2 = await list({ search: "pemohon", status: "menunggu", limit: "3", page: "2" });
  const expected = unbanRequests.filter((x) => x.status === "menunggu" && x.user_id >= uid(10)).length; // 6
  assert.equal(s1.body.meta.total, expected);
  assert.equal(s1.body.meta.totalPages, Math.ceil(expected / 3));
  assert.equal(s1.body.data.length + s2.body.data.length, Math.min(6, expected));
  assert.deepEqual((await list({ search: "pemohon", limit: "10", page: "9" })).body.data, []);
});

test("wildcard LIKE dan karakter sintaks filter diperlakukan sebagai teks; injeksi tidak berefek", async () => {
  assert.deepEqual(names(await list({ search: "%" })), ["100%_Real"]);
  assert.deepEqual(names(await list({ search: "_" })), ["100%_Real"]);
  assert.deepEqual(names(await list({ search: 'O"Brien, (Jr)' })), ['O"Brien, (Jr)']);
  const inj = await list({ search: 'x",status.eq.menunggu,email.ilike."%' });
  assert.equal(inj.status, 200);
  assert.deepEqual(inj.body.data, []);
});

test("validasi query: search>100, status/page/limit tidak valid, search array -> 422", async () => {
  assert.equal((await list({ search: "a".repeat(100) })).status, 200);
  assert.equal((await list({ search: "a".repeat(101) })).status, 422);
  assert.equal((await list({ status: "dihapus" })).status, 422);
  assert.equal((await list({ page: "0" })).status, 422);
  assert.equal((await list({ limit: "101" })).status, 422);
  const res = await realFetch(`${base}/unban-requests?search=a&search=b`, { headers: { authorization: "Bearer admin-token" } });
  assert.equal(res.status, 422);
});

test("otorisasi daftar: tanpa token 401, customer 403", async () => {
  assert.equal((await list({}, null)).status, 401);
  const r = await list({ search: "budi" }, "customer-token");
  assert.equal(r.status, 403);
  assert.equal(r.body.data, undefined);
});

test("kegagalan database pada daftar -> 500 terstruktur lalu pulih", async () => {
  state.failUnbanList = true;
  try {
    const r = await list({ search: "budi" });
    assert.equal(r.status, 500);
    assert.equal(r.body.success, false);
  } finally {
    state.failUnbanList = false;
  }
  assert.equal((await list()).status, 200);
});

// ---------------- Delete ----------------
test("DELETE: admin menghapus permohonan yang sudah diproses; hanya baris itu yang hilang, akun tidak berubah", async () => {
  const before = unbanRequests.length;
  const r = await del(rid(3)); // ditolak
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, { id: rid(3) });
  assert.equal(unbanRequests.length, before - 1);
  assert.ok(!unbanRequests.some((x) => x.id === rid(3)));
  assert.deepEqual(state.deleted, [rid(3)]);
  // Akun pengguna (termasuk pemohon yang dihapus permohonannya) tidak tersentuh.
  assert.deepEqual(users, usersBefore);
  // Daftar & total mengikuti penghapusan.
  assert.equal((await list()).body.meta.total, TOTAL - 1);
  assert.deepEqual((await list({ search: "100%" })).body.data, []);
});

test("DELETE kedua kali pada ID yang sama -> 404", async () => {
  const r = await del(rid(3));
  assert.equal(r.status, 404);
});

test("DELETE permohonan 'menunggu' ditolak 409 dan datanya tetap ada", async () => {
  const before = unbanRequests.length;
  const r = await del(rid(1));
  assert.equal(r.status, 409);
  assert.match(r.body.message, /menunggu/i);
  assert.equal(unbanRequests.length, before);
  assert.ok(unbanRequests.some((x) => x.id === rid(1)));
});

test("DELETE ID valid tapi tidak ada -> 404", async () => {
  assert.equal((await del("99999999-9999-4999-8999-999999999999")).status, 404);
});

test("DELETE ID tidak valid -> 422 dan tidak ada query hapus", async () => {
  const callsBefore = state.calls.length;
  for (const bad of ["abc", "123", "1;drop table users", "%27OR%271%27=%271", "../users"]) {
    const r = await del(bad);
    assert.ok(r.status === 422 || r.status === 404, `${bad} -> ${r.status}`); // "../users" dinormalisasi router menjadi path lain
    assert.notEqual(r.status, 200);
  }
  assert.equal((await del("abc")).status, 422);
  assert.equal((await del("abc")).body.errors[0].field, "id");
  const deleteCalls = state.calls.slice(callsBefore).filter((c) => c.method === "DELETE");
  assert.equal(deleteCalls.length, 0);
});

test("DELETE otorisasi: tanpa token 401, token ngawur 401, customer 403 (bahkan dengan ID invalid), tidak ada yang terhapus", async () => {
  const before = unbanRequests.length;
  assert.equal((await del(rid(2), null)).status, 401);
  assert.equal((await del(rid(2), "token-ngawur")).status, 401);
  assert.equal((await del(rid(2), "customer-token")).status, 403);
  assert.equal((await del("abc", "customer-token")).status, 403);
  assert.equal(unbanRequests.length, before);
  assert.ok(unbanRequests.some((x) => x.id === rid(2)));
});

test("DELETE gagal di database -> 500 dan data tetap ada; setelah pulih berhasil", async () => {
  state.failUnbanDelete = true;
  try {
    const r = await del(rid(2)); // disetujui
    assert.equal(r.status, 500);
    assert.equal(r.body.success, false);
    assert.ok(unbanRequests.some((x) => x.id === rid(2)));
  } finally {
    state.failUnbanDelete = false;
  }
  assert.equal((await del(rid(2))).status, 200);
  assert.ok(!unbanRequests.some((x) => x.id === rid(2)));
  assert.deepEqual(users, usersBefore);
});
