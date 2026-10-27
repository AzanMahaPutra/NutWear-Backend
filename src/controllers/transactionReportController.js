const transactionReportService = require("../services/transactionReportService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

/**
 * UPDATE — Halaman Laporan Transaksi & Export Excel (Admin).
 * Lihat transactionReportService.js untuk detail logic; controller ini hanya
 * membaca query string & meneruskannya, mengikuti pola controller lain di project ini.
 */

function readFilters(query) {
  const { filterType, startDate, endDate, month, year } = query;
  return { filterType, startDate, endDate, month, year };
}

/** UPDATE 07 — filter tabel: tanggal + search + kelompok status + sorting (hanya nilai string). */
function readListFilters(source = {}) {
  const str = (v) => (typeof v === "string" ? v : undefined);
  return {
    ...readFilters(source),
    search: str(source.search),
    statusGroup: str(source.statusGroup),
    sortBy: str(source.sortBy),
    sortDir: str(source.sortDir),
  };
}

const getReport = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await transactionReportService.getReport(readListFilters(req.query), { page, limit });
  return successResponse(res, {
    message: "Laporan transaksi berhasil diambil",
    data: result.data,
    meta: result.meta,
  });
});

/** UPDATE 07 — data Statistik/Diagram/Distribusi, mengikuti filter tanggal. */
const getAnalytics = asyncHandler(async (req, res) => {
  const data = await transactionReportService.getAnalytics(readFilters(req.query));
  return successResponse(res, { message: "Analitik transaksi berhasil diambil", data });
});

/**
 * UPDATE 07 — Ekspor CSV. Hanya MEMBACA data (tidak ada update status pembayaran/pesanan).
 * Otorisasi admin dipasang di router (requireAuth + requireRole("admin")).
 */
const exportCsv = asyncHandler(async (req, res) => {
  const { mode, ids, filters } = req.body;
  const prepared = await transactionReportService.prepareCsvExport({
    mode,
    ids: mode === "selected" ? ids : undefined,
    filters: readListFilters(filters ?? {}),
  });

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="transaksi-${stamp}.csv"`);
  res.setHeader("Cache-Control", "no-store");

  try {
    await prepared.writeTo(res);
    res.end();
  } catch (err) {
    // Header sudah terkirim: tidak bisa mengirim JSON error lagi — putuskan koneksi agar file
    // yang terpotong tidak dianggap lengkap oleh klien.
    res.destroy(err);
  }
});

/**
 * Export Excel — `scope=all` mengekspor SELURUH transaksi yang sudah berhasil dibayar
 * (mengabaikan filter tanggal yang sedang aktif), `scope=filtered` (default) mengikuti
 * filter yang sedang aktif di halaman. Respons berupa file .xlsx yang di-stream
 * langsung (bukan dibuffer penuh di memori) — lihat transactionReportService.exportToExcel.
 */
const exportExcel = asyncHandler(async (req, res) => {
  const { scope } = req.query;
  const filters = scope === "all" ? {} : readFilters(req.query);

  const timestamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="laporan-transaksi-${timestamp}.xlsx"`);

  await transactionReportService.exportToExcel(res, filters);
});

module.exports = { getReport, getAnalytics, exportCsv, exportExcel };
