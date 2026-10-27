const { body, query } = require("express-validator");

const updateProfileValidator = [
  body("namaLengkap").optional().trim().isLength({ min: 3 }).withMessage("Nama lengkap minimal 3 karakter"),
  body("noHp").optional().matches(/^(^\+62|62|^08)\d{7,13}$/).withMessage("Nomor HP tidak valid"),
];

const addressValidator = [
  body("receiverName").trim().isLength({ min: 3 }).withMessage("Nama penerima minimal 3 karakter"),
  body("phone").matches(/^(^\+62|62|^08)\d{7,13}$/).withMessage("Nomor telepon tidak valid"),
  body("province").trim().notEmpty().withMessage("Provinsi wajib diisi"),
  body("city").trim().notEmpty().withMessage("Kota wajib diisi"),
  body("district").trim().notEmpty().withMessage("Kecamatan wajib diisi"),
  body("postalCode").trim().isPostalCode("any").withMessage("Kode pos tidak valid"),
  body("address").trim().isLength({ min: 10 }).withMessage("Alamat lengkap minimal 10 karakter"),
  body("isDefault").optional().isBoolean(),
];

// UPDATE — Banned User: alasan banned wajib diisi (lihat userController.banUser).
const banUserValidator = [
  body("reason").trim().notEmpty().withMessage("Alasan banned wajib diisi").isLength({ max: 500 }).withMessage("Alasan banned maksimal 500 karakter"),
];

// UPDATE 08 — GET /users (Admin): pencarian nama/email + pagination.
const customerListValidator = [
  query("search")
    .optional({ checkFalsy: true })
    .isString()
    .withMessage("Kata kunci pencarian tidak valid")
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Kata kunci pencarian maksimal 100 karakter"),
  query("page").optional({ checkFalsy: true }).isInt({ min: 1, max: 1000000 }).withMessage("Halaman tidak valid"),
  query("limit").optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage("Limit tidak valid"),
];

module.exports = { updateProfileValidator, addressValidator, banUserValidator, customerListValidator };
