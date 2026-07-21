const { body } = require("express-validator");

const adjustStockValidator = [
  body("quantity").isInt({ min: 1 }).withMessage("Jumlah harus lebih dari 0"),
  body("type").isIn(["in", "out"]).withMessage("Tipe harus 'in' atau 'out'"),
];

// UPDATE — Notifikasi Stok Menipis untuk Admin (Pengaturan Batas Minimum Stok).
const updateMinimumStockValidator = [
  body("minimumStock").isInt({ min: 1 }).withMessage("Batas minimum stok harus berupa angka bulat lebih dari 0"),
];

module.exports = { adjustStockValidator, updateMinimumStockValidator };
