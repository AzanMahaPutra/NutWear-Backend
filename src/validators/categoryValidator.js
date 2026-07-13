const { body } = require("express-validator");

const categoryValidator = [
  body("namaKategori").trim().isLength({ min: 2 }).withMessage("Nama kategori minimal 2 karakter"),
];

module.exports = { categoryValidator };
