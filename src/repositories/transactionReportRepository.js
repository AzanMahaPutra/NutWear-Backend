const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");
const { ORDER_SELECT } = require("./orderRepository");
const { PAID_ORDER_STATUSES } = require("./dashboardRepository");
const { STATUS_GROUPS, DEFAULT_STATUS_GROUP, SORT_FIELDS } = require("../constants/transactionReport");

/**
 * UPDATE — Halaman Laporan Transaksi & Export Excel.
 *
 * Repository khusus untuk halaman baru "Laporan Transaksi" (berbeda dari halaman
 * Pesanan — lihat orderRepository/orderController untuk manajemen order biasa).
 * Halaman ini HANYA menampilkan transaksi yang pembayarannya sudah benar-benar
 * berhasil, memakai daftar status yang SAMA PERSIS dengan yang sudah dipakai
 * Pendapatan Dashboard Admin (dashboardRepository.PAID_ORDER_STATUSES) — sengaja
 * TIDAK mendefinisikan ulang daftar status supaya kedua fitur selalu sinkron dan
 * status pesanan yang dipakai selalu yang sudah diperbarui oleh Webhook Midtrans
 * (lihat paymentService.handleMidtransNotification).
 */

/**
 * Membangun rentang tanggal (created_at) dari salah satu dari 8 opsi filter pada
 * dokumen permintaan: Hari Ini, Kemarin, Minggu Ini, Bulan Ini, Tahun Ini, Rentang
 * Tanggal, Pilih Bulan, Pilih Tahun. Semua batas dihitung berbasis UTC (konsisten
 * dengan buildDateRange() di orderRepository.js yang juga berbasis UTC — supaya
 * kedua fitur tidak punya definisi "hari"/"bulan" yang berbeda tergantung timezone
 * server).
 */
function buildReportDateRange({ filterType, startDate, endDate, month, year }) {
  const now = new Date();
  const todayY = now.getUTCFullYear();
  const todayM = now.getUTCMonth();
  const todayD = now.getUTCDate();

  switch (filterType) {
    case "today": {
      const start = new Date(Date.UTC(todayY, todayM, todayD));
      const end = new Date(Date.UTC(todayY, todayM, todayD + 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "yesterday": {
      const start = new Date(Date.UTC(todayY, todayM, todayD - 1));
      const end = new Date(Date.UTC(todayY, todayM, todayD));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "this_week": {
      // Minggu dimulai Senin (konvensi Indonesia). getUTCDay(): 0=Minggu..6=Sabtu.
      const dayOfWeek = now.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const start = new Date(Date.UTC(todayY, todayM, todayD - diffToMonday));
      const end = new Date(Date.UTC(todayY, todayM, todayD - diffToMonday + 7));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "this_month": {
      const start = new Date(Date.UTC(todayY, todayM, 1));
      const end = new Date(Date.UTC(todayY, todayM + 1, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "this_year": {
      const start = new Date(Date.UTC(todayY, 0, 1));
      const end = new Date(Date.UTC(todayY + 1, 0, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "range": {
      if (!startDate || !endDate) return null;
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) return null;
      return { start: start.toISOString(), end: endExclusive.toISOString() };
    }
    case "specific_month": {
      if (!month) return null;
      const y = year ? Number(year) : todayY;
      const m = Number(month);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case "specific_year": {
      if (!year) return null;
      const y = Number(year);
      const start = new Date(Date.UTC(y, 0, 1));
      const end = new Date(Date.UTC(y + 1, 0, 1));
      return { start: start.toISOString(), end: end.toISOString() };
    }
    default:
      return null;
  }
}

/** Menerapkan filter tanggal (dari buildReportDateRange) + status "sudah dibayar" ke query builder. */
function applyPaidFilters(query, filters) {
  const range = buildReportDateRange(filters);
  if (range) {
    query = query.gte("created_at", range.start).lt("created_at", range.end);
  }
  return query.in("status", PAID_ORDER_STATUSES);
}

// ---------------------------------------------------------------------------
// UPDATE 07 — Search, kelompok status, sorting
// ---------------------------------------------------------------------------

/** UUID yang mustahil ada — dipakai agar query tidak mengembalikan apa pun saat pencarian tanpa hasil. */
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

/** Batas jumlah ID yang dimasukkan ke klausa OR (menjaga panjang URL PostgREST tetap aman). */
const SEARCH_ID_LIMIT = 200;

const SEARCH_MAX_LENGTH = 100;

/** Escape wildcard LIKE (`\`, `%`, `_`) supaya input admin dicocokkan sebagai teks biasa. */
function escapeLike(term) {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Kata kunci -> teks bersih (tanpa "#" di depan, spasi dirapikan, dipotong). */
function normalizeSearchTerm(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .slice(0, SEARCH_MAX_LENGTH);
}

/**
 * Menyelesaikan kata kunci pencarian menjadi klausa `.or(...)` PostgREST.
 *
 * Yang dicari (semuanya pada data yang SUDAH ada di model aktual):
 *  - ID transaksi (`orders.id`, boleh sebagian; "#A1B2C3D4" dari tabel juga bisa) — hanya jika
 *    kata kunci terdiri dari karakter UUID (hex & "-"), sehingga aman dimasukkan ke string OR.
 *  - Nomor transaksi Midtrans (`payments.midtrans_order_id`, mis. NUTWEAR-a1b2c3d4-9f8e7d).
 *  - Identitas pelanggan: nama, email, nomor HP (`users`).
 *
 * PostgREST tidak bisa meng-OR kolom tabel induk dengan kolom relasi dalam satu query, jadi
 * relasi dicari lebih dulu (maksimal SEARCH_ID_LIMIT ID) lalu dimasukkan ke OR sebagai
 * `user_id.in(...)` / `id.in(...)`. `truncated` = true bila hasil relasi terpotong oleh batas itu
 * (kata kunci terlalu umum) — frontend menampilkan peringatan.
 */
async function resolveSearch(rawTerm) {
  const term = normalizeSearchTerm(rawTerm);
  if (!term) return null;

  const like = `%${escapeLike(term)}%`;
  // Kolom diperiksa lewat query terpisah (bukan satu `.or()` berisi nilai ber-wildcard) supaya
  // nilai yang diketik admin tidak pernah ikut menjadi bagian sintaks filter PostgREST.
  const userQueries = ["nama_lengkap", "email", "no_hp"].map((column) =>
    supabase.from("users").select("id").ilike(column, like).limit(SEARCH_ID_LIMIT + 1)
  );
  const paymentQuery = supabase.from("payments").select("order_id").ilike("midtrans_order_id", like).limit(SEARCH_ID_LIMIT + 1);
  const results = await Promise.all([...userQueries, paymentQuery]);
  const failed = results.find((r) => r.error);
  if (failed) throw new AppError(failed.error.message, 500);

  const userRows = results.slice(0, 3).flatMap((r) => r.data);
  const paymentRows = results[3].data;
  const truncated = results.some((r) => r.data.length > SEARCH_ID_LIMIT);
  const userIds = [...new Set(userRows.map((u) => u.id))].slice(0, SEARCH_ID_LIMIT);
  const paymentOrderIds = [...new Set(paymentRows.map((p) => p.order_id))].slice(0, SEARCH_ID_LIMIT);

  const parts = [];
  if (/^[0-9a-f-]+$/i.test(term)) parts.push(`id_text.ilike.*${term}*`);
  if (userIds.length > 0) parts.push(`user_id.in.(${userIds.join(",")})`);
  if (paymentOrderIds.length > 0) parts.push(`id.in.(${paymentOrderIds.join(",")})`);

  return { clause: parts.length > 0 ? parts.join(",") : null, truncated };
}

/**
 * Tanggal + kelompok status + search + (opsional) sorting. `search` harus sudah di-resolve
 * (resolveSearch) karena pencarian relasi butuh query tambahan yang asinkron.
 */
function applyListFilters(query, filters = {}, resolvedSearch = null) {
  const range = buildReportDateRange(filters);
  if (range) {
    query = query.gte("created_at", range.start).lt("created_at", range.end);
  }

  const group = filters.statusGroup || DEFAULT_STATUS_GROUP;
  if (group !== "all" && STATUS_GROUPS[group]) {
    query = query.in("status", STATUS_GROUPS[group].statuses);
  }

  if (resolvedSearch) {
    query = resolvedSearch.clause ? query.or(resolvedSearch.clause) : query.eq("id", NO_MATCH_ID);
  }
  return query;
}

function applySort(query, { sortBy, sortDir } = {}) {
  const column = SORT_FIELDS[sortBy] ?? SORT_FIELDS.tanggal;
  const ascending = sortDir === "asc";
  // `id` sebagai pembeda urutan supaya pagination stabil saat banyak baris bernilai sama.
  return query.order(column, { ascending }).order("id", { ascending: true });
}

/**
 * Daftar transaksi (halaman/tabel Laporan Transaksi) — server-side pagination lewat
 * `.range()` (pola yang sama dengan productRepository.findAll), supaya frontend TIDAK
 * PERNAH memuat seluruh transaksi sekaligus walau jumlahnya sudah ribuan.
 * UPDATE 07: + search, kelompok status (default "paid" = perilaku lama), sorting.
 */
async function findOrders(filters = {}, { page = 1, limit = 20 } = {}) {
  const search = await resolveSearch(filters.search);
  let query = supabase.from("orders").select(ORDER_SELECT, { count: "exact" });
  query = applyListFilters(query, filters, search);
  query = applySort(query, filters);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw new AppError(error.message, 500);
  return { data, total: count || 0, searchTruncated: Boolean(search?.truncated) };
}

/** Jumlah transaksi yang cocok dengan filter (tanpa mengambil datanya) — dipakai sebelum ekspor. */
async function countOrders(filters = {}) {
  const search = await resolveSearch(filters.search);
  let query = supabase.from("orders").select("id", { count: "exact", head: true });
  query = applyListFilters(query, filters, search);
  const { error, count } = await query;
  if (error) throw new AppError(error.message, 500);
  return count || 0;
}

/**
 * Satu "halaman" data lengkap (dengan seluruh relasi ORDER_SELECT) untuk ekspor CSV hasil
 * filter — diambil per batch kecil supaya tidak pernah memuat seluruh hasil ke memori.
 * `resolvedSearch` di-resolve SEKALI oleh pemanggil (bukan di tiap batch).
 */
async function findOrdersBatch(filters, resolvedSearch, page, batchSize) {
  let query = supabase.from("orders").select(ORDER_SELECT);
  query = applyListFilters(query, filters, resolvedSearch);
  query = applySort(query, filters);
  const from = (page - 1) * batchSize;
  const { data, error } = await query.range(from, from + batchSize - 1);
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** Transaksi berdasarkan daftar ID (ekspor "transaksi terpilih"). Hanya membaca. */
async function findOrdersByIds(ids) {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new AppError(error.message, 500);
  return data;
}

// ---------------------------------------------------------------------------
// UPDATE 07 — Data analitik (Statistik / Diagram / Distribusi)
// ---------------------------------------------------------------------------

const ANALYTICS_PAGE_SIZE = 1000; // batas baris default PostgREST/Supabase per request

/**
 * Mengambil SELURUH baris sebuah query dengan membaginya per ANALYTICS_PAGE_SIZE lewat
 * `.range()`. Dibutuhkan karena PostgREST memotong hasil di ~1000 baris — tanpa ini total
 * pendapatan diam-diam salah saat transaksi lebih dari 1000. `buildQuery` harus selalu
 * mengembalikan query BARU dengan urutan yang stabil.
 */
async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + ANALYTICS_PAGE_SIZE - 1);
    if (error) throw new AppError(error.message, 500);
    rows.push(...data);
    if (data.length < ANALYTICS_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Seluruh transaksi (SEMUA status) pada rentang tanggal filter — hanya kolom yang dibutuhkan
 * analitik. Search & kelompok status tabel TIDAK dipakai di sini: analitik selalu menggambarkan
 * seluruh transaksi pada periode yang dipilih, supaya komposisi status (pending/gagal/refund)
 * tetap terlihat walau tabel sedang difilter ke "Berhasil Dibayar".
 */
async function findOrdersForAnalytics(filters = {}) {
  const range = buildReportDateRange(filters);
  return fetchAllRows(() => {
    let query = supabase.from("orders").select("id, status, grand_total, created_at, payments ( payment_type )");
    if (range) query = query.gte("created_at", range.start).lt("created_at", range.end);
    return query.order("created_at", { ascending: true }).order("id", { ascending: true });
  });
}

/** Jumlah unit terjual (order_items.quantity) pada transaksi BERHASIL DIBAYAR di rentang filter. */
async function sumPaidItemQuantity(filters = {}) {
  const range = buildReportDateRange(filters);
  const rows = await fetchAllRows(() => {
    let query = supabase.from("order_items").select("quantity, orders!inner(status, created_at)");
    query = query.in("orders.status", PAID_ORDER_STATUSES);
    if (range) query = query.gte("orders.created_at", range.start).lt("orders.created_at", range.end);
    return query.order("id", { ascending: true });
  });
  return rows.reduce((sum, row) => sum + (row.quantity || 0), 0);
}


/**
 * Dipertahankan untuk Export Excel yang sudah ada (transactionReportService.exportToExcel).
 * Perilaku tidak berubah: hanya transaksi berhasil dibayar, urut tanggal naik.
 */
async function findPaidOrdersBatch(filters, page, batchSize) {
  let query = supabase.from("orders").select(ORDER_SELECT);
  query = applyPaidFilters(query, filters);

  const from = (page - 1) * batchSize;
  const to = from + batchSize - 1;
  query = query.order("created_at", { ascending: true }).range(from, to);

  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
}

module.exports = {
  buildReportDateRange,
  applyPaidFilters,
  normalizeSearchTerm,
  escapeLike,
  findOrders,
  countOrders,
  findOrdersBatch,
  findOrdersByIds,
  resolveSearch,
  findOrdersForAnalytics,
  sumPaidItemQuantity,
  // Dipertahankan untuk Export Excel yang sudah ada (tidak berubah perilakunya).
  findPaidOrdersBatch,
};
