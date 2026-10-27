/**
 * UPDATE 08 — Tes pencarian pelanggan: GET /api/v1/users?search=&page=&limit=
 * Jalankan: `npm test` (node:test bawaan Node, tanpa dependensi tambahan).
 */
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://fake.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.SUPABASE_ANON_KEY = "anon-test";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createFakeBackend } = require("./fakePostgrest");

// ---- Data uji -------------------------------------------------------------
const ADMIN = { id: "00000000-0000-4000-8000-000000000001", email: "admin@nutwear.id", nama_lengkap: "Admin Budi", role: "admin" };
const mk = (n, extra = {}) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  nama_lengkap: `Pelanggan ${String(n).padStart(2, "0")}`,
  email: `pelanggan${String(n).padStart(2, "0")}@toko.id`,
  no_hp: "081234567890",
  role: "customer",
  status: "aktif",
  banned_reason: null,
  banned_at: null,
  // n kecil = lebih lama. Jam dibuat berbeda supaya urutan "terbaru dulu" pasti.
  created_at: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
  ...extra,
});

const customers = [];
for (let n = 1; n <= 23; n++) customers.push(mk(n));
const special = [
  mk(101, { nama_lengkap: "Budi Santoso", email: "budi.santoso@mail.com" }),
  mk(102, { nama_lengkap: "Siti Aisyah", email: "SITI@Example.COM" }),
  mk(103, { nama_lengkap: "100%_Real", email: "persen@mail.com" }),
  mk(104, { nama_lengkap: 'O"Brien, (Jr)', email: "obrien@mail.com" }),
  mk(105, { nama_lengkap: "Back\\slash", email: "slash@mail.com" }),
  mk(106, { nama_lengkap: "Rina Banned", email: "rina@mail.com", status: "banned", banned_reason: "Spam Review", banned_at: "2026-02-01T00:00:00Z" }),
  mk(107, { nama_lengkap: "Plus Tag", email: "a.b+tag@example.com" }),
  mk(108, { nama_lengkap: "Underscore_Name", email: "us@mail.com" }),
  mk(109, { nama_lengkap: "UnderscoreXName", email: "usx@mail.com" }),
];
const allUsers = [ADMIN, ...customers, ...special];
const ALL_CUSTOMER_COUNT = customers.length + special.length; // 32

const { fakeFetch, state } = createFakeBackend({
  tokens: {
    "admin-token": { id: ADMIN.id, email: ADMIN.email },
    "customer-token": { id: customers[0].id, email: customers[0].email },
  },
  users: allUsers,
  orderCounts: { [special[0].id]: 5 },
  reviewCounts: { [special[0].id]: 2 },
});
const realFetch = globalThis.fetch; // dipakai tes untuk memanggil server Express lokal
globalThis.fetch = fakeFetch; // harus sebelum supabase-js dibuat

const app = require("../src/app");

let server;
let base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
test.after(() => new Promise((r) => server.close(r)));

async function list(params = {}, token = "admin-token") {
  const qs = new URLSearchParams(params).toString();
  const res = await realFetch(`${base}/users${qs ? `?${qs}` : ""}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json() };
}
const names = (r) => r.body.data.map((c) => c.namaLengkap);

// ---- Tes --------------------------------------------------------------------
test("tanpa search: semua pelanggan (bukan admin), terbaru dulu, halaman 1 default 10", async () => {
  const r = await list();
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 10);
  assert.deepEqual(r.body.meta, { page: 1, limit: 10, total: ALL_CUSTOMER_COUNT, totalPages: 4 });
  assert.ok(!names(r).includes("Admin Budi"));
  // terbaru dulu: 109, 108, ...
  assert.equal(r.body.data[0].namaLengkap, "UnderscoreXName");
});

test("cari username (nama), sebagian kata", async () => {
  const r = await list({ search: "santoso" });
  assert.equal(r.status, 200);
  assert.deepEqual(names(r), ["Budi Santoso"]);
  assert.equal(r.body.meta.total, 1);
  assert.equal(r.body.data[0].orderCount, 5);
  assert.equal(r.body.data[0].reviewCount, 2);
});

test("cari email, sebagian kata", async () => {
  const r = await list({ search: "pelanggan07@" });
  assert.deepEqual(names(r), ["Pelanggan 07"]);
  const r2 = await list({ search: "example.com" });
  assert.deepEqual(names(r2).sort(), ["Plus Tag", "Siti Aisyah"]);
});

test("case-insensitive: BUDI / budi / BuDi untuk nama, SITI@example.com untuk email", async () => {
  for (const q of ["BUDI", "budi", "BuDi sAnToSo"]) {
    const r = await list({ search: q });
    assert.deepEqual(names(r), ["Budi Santoso"], `query ${q}`);
  }
  // email tersimpan "SITI@Example.COM"
  assert.deepEqual(names(await list({ search: "siti@example.com" })), ["Siti Aisyah"]);
  assert.deepEqual(names(await list({ search: "SITI@EXAMPLE.COM" })), ["Siti Aisyah"]);
});

test("admin tidak pernah muncul walau namanya cocok (Admin Budi)", async () => {
  const r = await list({ search: "budi" });
  assert.deepEqual(names(r), ["Budi Santoso"]);
  assert.equal(r.body.meta.total, 1);
});

test("hasil kosong: data [] dan total 0, totalPages minimal 1", async () => {
  const r = await list({ search: "tidak-ada-orang-ini" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, []);
  assert.deepEqual(r.body.meta, { page: 1, limit: 10, total: 0, totalPages: 1 });
});

test("pagination: halaman 1..4 tidak tumpang tindih, jumlah total konsisten", async () => {
  const seen = [];
  for (let page = 1; page <= 4; page++) {
    const r = await list({ page: String(page), limit: "10" });
    assert.equal(r.body.meta.total, ALL_CUSTOMER_COUNT);
    seen.push(...r.body.data.map((c) => c.id));
  }
  assert.equal(seen.length, ALL_CUSTOMER_COUNT);
  assert.equal(new Set(seen).size, ALL_CUSTOMER_COUNT);
});

test("pagination + search: total & halaman mengikuti hasil pencarian", async () => {
  // "pelanggan" cocok dengan 23 pelanggan (nama & email) + tidak dengan data khusus
  const p1 = await list({ search: "pelanggan", page: "1", limit: "10" });
  const p3 = await list({ search: "pelanggan", page: "3", limit: "10" });
  assert.deepEqual(p1.body.meta, { page: 1, limit: 10, total: 23, totalPages: 3 });
  assert.equal(p1.body.data.length, 10);
  assert.equal(p3.body.data.length, 3);
  const p4 = await list({ search: "pelanggan", page: "4", limit: "10" });
  assert.deepEqual(p4.body.data, []); // di luar rentang -> kosong, bukan error
  assert.equal(p4.body.meta.total, 23);
});

test("urutan stabil saat created_at kembar (pemutus seri id)", async () => {
  const same = "2027-01-01T00:00:00.000Z";
  const extra = [1, 2, 3, 4, 5].map((n) => mk(200 + n, { nama_lengkap: `Kembar ${n}`, email: `kembar${n}@t.id`, created_at: same }));
  allUsers.push(...extra);
  try {
    const a = await list({ search: "kembar", page: "1", limit: "2" });
    const b = await list({ search: "kembar", page: "2", limit: "2" });
    const c = await list({ search: "kembar", page: "3", limit: "2" });
    const ids = [...a.body.data, ...b.body.data, ...c.body.data].map((x) => x.id);
    assert.equal(new Set(ids).size, 5);
  } finally {
    allUsers.splice(allUsers.length - extra.length, extra.length);
  }
});

test("wildcard LIKE diperlakukan sebagai teks: % dan _ tidak mencocokkan semua", async () => {
  assert.deepEqual(names(await list({ search: "%" })), ["100%_Real"]);
  assert.deepEqual(names(await list({ search: "100%_" })), ["100%_Real"]);
  // "_" harfiah: hanya "Underscore_Name" (dan "100%_Real"), bukan "UnderscoreXName"
  assert.deepEqual(names(await list({ search: "_" })).sort(), ["100%_Real", "Underscore_Name"]);
  assert.deepEqual(names(await list({ search: "e_N" })), ["Underscore_Name"]);
});

test("karakter sintaks filter (kutip, koma, kurung, backslash, titik) aman, tidak merusak query", async () => {
  assert.deepEqual(names(await list({ search: 'O"Brien' })), ['O"Brien, (Jr)']);
  assert.deepEqual(names(await list({ search: ", (Jr)" })), ['O"Brien, (Jr)']);
  assert.deepEqual(names(await list({ search: "Back\\slash" })), ["Back\\slash"]);
  assert.deepEqual(names(await list({ search: "a.b+tag" })), ["Plus Tag"]);
  // upaya injeksi filter: harus dianggap teks biasa -> tidak ada yang cocok, bukan "semua baris"
  const inj = await list({ search: 'x",role.eq.admin,email.ilike."%' });
  assert.equal(inj.status, 200);
  assert.deepEqual(inj.body.data, []);
  const inj2 = await list({ search: "),(role.eq.admin" });
  assert.equal(inj2.status, 200);
  assert.deepEqual(inj2.body.data, []);
});

test("spasi di tepi di-trim; hanya spasi = tanpa pencarian; karakter kontrol dibuang", async () => {
  assert.deepEqual(names(await list({ search: "  santoso  " })), ["Budi Santoso"]);
  assert.equal((await list({ search: "   " })).body.meta.total, ALL_CUSTOMER_COUNT);
  const r = await list({ search: "santoso\u0000" });
  assert.equal(r.status, 200);
  assert.deepEqual(names(r), ["Budi Santoso"]);
});

test("filter status ban & aksi tetap: status/alasan banned ikut di hasil", async () => {
  const r = await list({ search: "rina" });
  assert.equal(r.body.data[0].status, "banned");
  assert.equal(r.body.data[0].bannedReason, "Spam Review");
});

test("validasi: search > 100 karakter, page/limit tidak valid, search array -> 422", async () => {
  assert.equal((await list({ search: "a".repeat(100) })).status, 200);
  assert.equal((await list({ search: "a".repeat(101) })).status, 422);
  assert.equal((await list({ page: "0" })).status, 422);
  assert.equal((await list({ page: "abc" })).status, 422);
  assert.equal((await list({ limit: "0" })).status, 422);
  assert.equal((await list({ limit: "101" })).status, 422);
  const res = await realFetch(`${base}/users?search=a&search=b`, { headers: { authorization: "Bearer admin-token" } });
  assert.equal(res.status, 422);
});

test("otorisasi admin tetap: tanpa token 401, token customer 403", async () => {
  assert.equal((await list({}, null)).status, 401);
  assert.equal((await list({}, "token-ngawur")).status, 401);
  const r = await list({ search: "budi" }, "customer-token");
  assert.equal(r.status, 403);
  assert.equal(r.body.data, undefined);
});

test("kegagalan database: respons 500 terstruktur, tidak membocorkan data", async () => {
  state.failUsersList = true;
  try {
    const r = await list({ search: "budi" });
    assert.equal(r.status, 500);
    assert.equal(r.body.success, false);
    assert.equal(r.body.data, undefined);
  } finally {
    state.failUsersList = false;
  }
  assert.equal((await list({ search: "budi" })).status, 200);
});
