const { body } = require("express-validator");

// UPDATE — Pengajuan Unban: alasan permohonan wajib diisi.
const submitUnbanRequestValidator = [
  body("requestReason")
    .trim()
    .notEmpty()
    .withMessage("Alasan permohonan unban wajib diisi")
    .isLength({ max: 500 })
    .withMessage("Alasan permohonan unban maksimal 500 karakter"),
];

module.exports = { submitUnbanRequestValidator };
