const { body, query, param } = require("express-validator");

// UPDATE — Pengajuan Unban: alasan permohonan wajib diisi.
const submitUnbanRequestValidator = [
  body("requestReason")
    .trim()
    .notEmpty()
    .withMessage("Alasan permohonan unban wajib diisi")
    .isLength({ max: 500 })
    .withMessage("Alasan permohonan unban maksimal 500 karakter"),
];

// UPDATE 09 — GET /unban-requests (Admin): search nama/email + filter status + pagination.
const UNBAN_STATUS_FILTERS = ["menunggu", "disetujui", "ditolak"];
const unbanRequestListValidator = [
  query("search")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Kata kunci pencarian tidak valid")
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Kata kunci pencarian maksimal 100 karakter"),
  query("status").optional({ checkFalsy: true }).isIn(UNBAN_STATUS_FILTERS).withMessage("Status permohonan tidak valid"),
  query("page").optional({ checkFalsy: true }).isInt({ min: 1, max: 1000000 }).withMessage("Halaman tidak valid"),
  query("limit").optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage("Limit tidak valid"),
];

// UPDATE 09 — DELETE /unban-requests/:id: id wajib UUID valid.
const deleteUnbanRequestValidator = [param("id").isUUID().withMessage("ID permohonan tidak valid")];

module.exports = { submitUnbanRequestValidator, unbanRequestListValidator, deleteUnbanRequestValidator, UNBAN_STATUS_FILTERS };
