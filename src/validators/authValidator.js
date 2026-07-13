const { body } = require("express-validator");

/**
 * Skema validasi request Auth. Reusable, dipasang di route sebelum handleValidation.
 */
const registerValidator = [
  body("namaLengkap").trim().isLength({ min: 3 }).withMessage("Nama lengkap minimal 3 karakter"),
  body("email").trim().isEmail().withMessage("Format email tidak valid"),
  body("password").isLength({ min: 6 }).withMessage("Password minimal 6 karakter"),
  body("noHp").optional().isMobilePhone("id-ID").withMessage("Nomor HP tidak valid"),
];

const loginValidator = [
  body("email").trim().isEmail().withMessage("Format email tidak valid"),
  body("password").notEmpty().withMessage("Password wajib diisi"),
];

module.exports = { registerValidator, loginValidator };
