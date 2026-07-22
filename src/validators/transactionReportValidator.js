const { query } = require("express-validator");

/**
 * UPDATE — Halaman Laporan Transaksi & Export Excel.
 *
 * 8 opsi filter sesuai dokumen: Hari Ini, Kemarin, Minggu Ini, Bulan Ini, Tahun Ini,
 * Rentang Tanggal, Pilih Bulan, Pilih Tahun — dipetakan ke `filterType` di bawah ini.
 * `filterType` kosong/tidak dikirim berarti "Semua Transaksi" (tanpa batas tanggal),
 * dipakai sebagai kondisi awal halaman sebelum admin memilih filter apa pun.
 */
const REPORT_FILTER_TYPES = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "this_year",
  "range",
  "specific_month",
  "specific_year",
];

/** Validasi query bersama dipakai baik untuk daftar+ringkasan (GET /) maupun export (GET /export). */
const transactionReportFilterValidator = [
  query("filterType").optional({ checkFalsy: true }).isIn(REPORT_FILTER_TYPES).withMessage("Filter laporan tidak valid"),
  query("startDate")
    .if(query("filterType").equals("range"))
    .notEmpty()
    .withMessage("Tanggal awal wajib diisi untuk filter Rentang Tanggal")
    .bail()
    .isISO8601()
    .withMessage("Format tanggal awal tidak valid (YYYY-MM-DD)"),
  query("endDate")
    .if(query("filterType").equals("range"))
    .notEmpty()
    .withMessage("Tanggal akhir wajib diisi untuk filter Rentang Tanggal")
    .bail()
    .isISO8601()
    .withMessage("Format tanggal akhir tidak valid (YYYY-MM-DD)"),
  query("month")
    .if(query("filterType").equals("specific_month"))
    .notEmpty()
    .withMessage("Bulan wajib diisi untuk filter Pilih Bulan")
    .bail()
    .isInt({ min: 1, max: 12 })
    .withMessage("Bulan tidak valid"),
  query("year")
    .if(query("filterType").isIn(["specific_month", "specific_year"]))
    .notEmpty()
    .withMessage("Tahun wajib diisi untuk filter Pilih Bulan/Pilih Tahun")
    .bail()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Tahun tidak valid"),
];

/** GET /transaction-reports — tambahan validasi pagination di atas filter bersama. */
const transactionReportListValidator = [
  ...transactionReportFilterValidator,
  query("page").optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage("Halaman tidak valid"),
  query("limit").optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage("Limit tidak valid"),
];

/** GET /transaction-reports/export — tambahan validasi `scope` (data sesuai filter, atau seluruh transaksi). */
const transactionReportExportValidator = [
  ...transactionReportFilterValidator,
  query("scope").optional({ checkFalsy: true }).isIn(["filtered", "all"]).withMessage("Cakupan export tidak valid"),
];

module.exports = {
  REPORT_FILTER_TYPES,
  transactionReportListValidator,
  transactionReportExportValidator,
};
