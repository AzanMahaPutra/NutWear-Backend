const { query, body } = require("express-validator");
const { STATUS_GROUP_FILTERS, SORT_FIELDS } = require("../constants/transactionReport");

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

/**
 * Validasi filter bersama. Dipakai untuk query string (GET) maupun body JSON (POST ekspor CSV):
 * `field` = fungsi express-validator (`query` / `body`), `prefix` = awalan path ("" atau "filters.").
 */
function buildFilterValidators(field, prefix = "") {
  const f = (name) => field(`${prefix}${name}`);
  return [
    f("filterType").optional({ checkFalsy: true }).isIn(REPORT_FILTER_TYPES).withMessage("Filter laporan tidak valid"),
    f("startDate")
      .if(f("filterType").equals("range"))
      .notEmpty()
      .withMessage("Tanggal awal wajib diisi untuk filter Rentang Tanggal")
      .bail()
      .isISO8601()
      .withMessage("Format tanggal awal tidak valid (YYYY-MM-DD)"),
    f("endDate")
      .if(f("filterType").equals("range"))
      .notEmpty()
      .withMessage("Tanggal akhir wajib diisi untuk filter Rentang Tanggal")
      .bail()
      .isISO8601()
      .withMessage("Format tanggal akhir tidak valid (YYYY-MM-DD)"),
    f("month")
      .if(f("filterType").equals("specific_month"))
      .notEmpty()
      .withMessage("Bulan wajib diisi untuk filter Pilih Bulan")
      .bail()
      .isInt({ min: 1, max: 12 })
      .withMessage("Bulan tidak valid"),
    f("year")
      .if(f("filterType").isIn(["specific_month", "specific_year"]))
      .notEmpty()
      .withMessage("Tahun wajib diisi untuk filter Pilih Bulan/Pilih Tahun")
      .bail()
      .isInt({ min: 2000, max: 2100 })
      .withMessage("Tahun tidak valid"),
  ];
}

/** UPDATE 07 — filter khusus tabel: search, kelompok status, sorting. */
function buildListOnlyValidators(field, prefix = "") {
  const f = (name) => field(`${prefix}${name}`);
  return [
    f("search")
      .optional({ checkFalsy: true })
      .isString()
      .withMessage("Kata kunci pencarian tidak valid")
      .bail()
      .isLength({ max: 100 })
      .withMessage("Kata kunci pencarian maksimal 100 karakter"),
    f("statusGroup").optional({ checkFalsy: true }).isIn(STATUS_GROUP_FILTERS).withMessage("Status transaksi tidak valid"),
    f("sortBy").optional({ checkFalsy: true }).isIn(Object.keys(SORT_FIELDS)).withMessage("Kolom pengurutan tidak valid"),
    f("sortDir").optional({ checkFalsy: true }).isIn(["asc", "desc"]).withMessage("Arah pengurutan tidak valid"),
  ];
}

/** Validasi query bersama dipakai baik untuk daftar (GET /) maupun export Excel (GET /export). */
const transactionReportFilterValidator = buildFilterValidators(query);

/** GET /transaction-reports — filter tanggal + search/status/sorting + pagination. */
const transactionReportListValidator = [
  ...transactionReportFilterValidator,
  ...buildListOnlyValidators(query),
  query("page").optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage("Halaman tidak valid"),
  query("limit").optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage("Limit tidak valid"),
];

/** GET /transaction-reports/analytics — hanya filter tanggal (analitik mengikuti periode, bukan search/status tabel). */
const transactionReportAnalyticsValidator = transactionReportFilterValidator;

/** GET /transaction-reports/export — tambahan validasi `scope` (data sesuai filter, atau seluruh transaksi). */
const transactionReportExportValidator = [
  ...transactionReportFilterValidator,
  query("scope").optional({ checkFalsy: true }).isIn(["filtered", "all"]).withMessage("Cakupan export tidak valid"),
];

/** Batas ID per ekspor "terpilih" = ukuran halaman maksimum tabel. */
const CSV_SELECTED_MAX_IDS = 100;

/**
 * POST /transaction-reports/export-csv
 * body: { mode: "selected" | "filtered", ids?: uuid[], filters?: {...} }
 */
const transactionReportCsvExportValidator = [
  body("mode").isIn(["selected", "filtered"]).withMessage("Mode ekspor tidak valid"),
  body("ids")
    .if(body("mode").equals("selected"))
    .isArray({ min: 1, max: CSV_SELECTED_MAX_IDS })
    .withMessage(`Pilih 1 sampai ${CSV_SELECTED_MAX_IDS} transaksi untuk diekspor`),
  body("ids.*").if(body("mode").equals("selected")).isUUID().withMessage("ID transaksi tidak valid"),
  body("filters").optional({ nullable: true }).isObject().withMessage("Filter ekspor tidak valid"),
  ...buildFilterValidators(body, "filters."),
  ...buildListOnlyValidators(body, "filters."),
];

module.exports = {
  REPORT_FILTER_TYPES,
  CSV_SELECTED_MAX_IDS,
  transactionReportListValidator,
  transactionReportAnalyticsValidator,
  transactionReportExportValidator,
  transactionReportCsvExportValidator,
};
