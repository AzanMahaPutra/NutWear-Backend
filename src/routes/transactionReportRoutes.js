const express = require("express");
const transactionReportController = require("../controllers/transactionReportController");
const {
  transactionReportListValidator,
  transactionReportAnalyticsValidator,
  transactionReportExportValidator,
  transactionReportCsvExportValidator,
} = require("../validators/transactionReportValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

/**
 * UPDATE — Halaman Laporan Transaksi & Export Excel (Admin). Route baru, terpisah dari
 * orderRoutes.js (halaman Pesanan) supaya tidak menyentuh route/behavior yang sudah ada.
 * Seluruhnya khusus admin.
 */
const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// Didaftarkan SEBELUM route lain (mengikuti pola orderRoutes.js untuk /search-suggestions)
// agar tidak ada konflik path — di sini kedua route sama-sama statis jadi aman, tapi
// urutan tetap dijaga supaya konsisten.
router.get("/export", transactionReportExportValidator, handleValidation, transactionReportController.exportExcel);
// UPDATE 07 — analitik (Statistik/Diagram/Distribusi) & ekspor CSV (transaksi terpilih / hasil filter).
router.get("/analytics", transactionReportAnalyticsValidator, handleValidation, transactionReportController.getAnalytics);
router.post("/export-csv", transactionReportCsvExportValidator, handleValidation, transactionReportController.exportCsv);
router.get("/", transactionReportListValidator, handleValidation, transactionReportController.getReport);

module.exports = router;
