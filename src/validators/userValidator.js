const { body } = require("express-validator");

const updateProfileValidator = [
  body("namaLengkap").optional().trim().isLength({ min: 3 }).withMessage("Nama lengkap minimal 3 karakter"),
  body("noHp").optional().isMobilePhone("id-ID").withMessage("Nomor HP tidak valid"),
];

const addressValidator = [
  body("receiverName").trim().isLength({ min: 3 }).withMessage("Nama penerima minimal 3 karakter"),
  body("phone").isMobilePhone("id-ID").withMessage("Nomor telepon tidak valid"),
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

module.exports = { updateProfileValidator, addressValidator, banUserValidator };
