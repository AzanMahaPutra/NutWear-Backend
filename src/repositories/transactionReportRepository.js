const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");
const { ORDER_SELECT } = require("./orderRepository");
const { PAID_ORDER_STATUSES } = require("./dashboardRepository");

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

/**
 * Daftar transaksi (halaman/tabel Laporan Transaksi) — server-side pagination lewat
 * `.range()` (pola yang sama dengan productRepository.findAll), supaya frontend TIDAK
 * PERNAH memuat seluruh transaksi sekaligus walau jumlahnya sudah ribuan.
 */
async function findPaidOrders(filters = {}, { page = 1, limit = 20 } = {}) {
  let query = supabase.from("orders").select(ORDER_SELECT, { count: "exact" });
  query = applyPaidFilters(query, filters);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new AppError(error.message, 500);
  return { data, total: count || 0 };
}

/**
 * Ringkasan (kartu Total Transaksi/Pendapatan/Produk Terjual/Rata-rata) mengikuti
 * filter yang sedang aktif. Dihitung di backend dari SELURUH baris yang cocok
 * dengan filter (bukan hanya satu halaman) tapi hanya mengambil kolom yang
 * benar-benar dibutuhkan (`grand_total`/`id` untuk orders, `quantity` untuk
 * order_items) — bukan ORDER_SELECT lengkap — supaya tetap ringan walau jumlah
 * transaksi sudah sangat banyak.
 */
async function getSummary(filters = {}) {
  let orderQuery = supabase.from("orders").select("grand_total", { count: "exact" });
  orderQuery = applyPaidFilters(orderQuery, filters);
  const { data: orderRows, error: orderError, count } = await orderQuery;
  if (orderError) throw new AppError(orderError.message, 500);

  const totalTransaksi = count || 0;
  const totalPendapatan = orderRows.reduce((sum, o) => sum + (o.grand_total || 0), 0);

  // Filter pada tabel relasi (order_items -> orders) lewat embedded resource `!inner`
  // + dot-notation, supaya cukup satu query tanpa perlu mengambil daftar order_id
  // yang cocok terlebih dahulu.
  let itemQuery = supabase.from("order_items").select("quantity, orders!inner(status, created_at)");
  itemQuery = itemQuery.in("orders.status", PAID_ORDER_STATUSES);
  const range = buildReportDateRange(filters);
  if (range) {
    itemQuery = itemQuery.gte("orders.created_at", range.start).lt("orders.created_at", range.end);
  }
  const { data: itemRows, error: itemError } = await itemQuery;
  if (itemError) throw new AppError(itemError.message, 500);

  const totalProdukTerjual = itemRows.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const rataRataNilaiTransaksi = totalTransaksi > 0 ? Math.round(totalPendapatan / totalTransaksi) : 0;

  return { totalTransaksi, totalPendapatan, totalProdukTerjual, rataRataNilaiTransaksi };
}

/**
 * Satu "halaman" data lengkap (dengan seluruh relasi ORDER_SELECT) untuk kebutuhan
 * Export Excel — dipanggil berulang oleh transactionReportService dengan `page` yang
 * naik (batch kecil, mis. 200 baris) supaya seluruh transaksi (bisa ribuan) TIDAK
 * PERNAH dimuat sekaligus ke memori dalam satu query, dan penulisan file Excel bisa
 * langsung di-stream per batch.
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
  findPaidOrders,
  getSummary,
  findPaidOrdersBatch,
};
