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

const forgotPasswordValidator = [body("email").trim().isEmail().withMessage("Format email tidak valid")];

const resetPasswordValidator = [
  body("token").trim().notEmpty().withMessage("Token reset password wajib diisi"),
  body("password").isLength({ min: 6 }).withMessage("Password minimal 6 karakter"),
  body("confirmPassword").custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error("Konfirmasi password tidak cocok");
    }
    return true;
  }),
];

module.exports = { registerValidator, loginValidator, forgotPasswordValidator, resetPasswordValidator };
