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

const getReport = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await transactionReportService.getReport(readFilters(req.query), { page, limit });
  return successResponse(res, {
    message: "Laporan transaksi berhasil diambil",
    data: result.data,
    meta: { ...result.meta, summary: result.summary },
  });
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

module.exports = { getReport, exportExcel };
