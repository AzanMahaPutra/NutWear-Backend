const { body } = require("express-validator");

const adjustStockValidator = [
  body("quantity").isInt({ min: 1 }).withMessage("Jumlah harus lebih dari 0"),
  body("type").isIn(["in", "out"]).withMessage("Tipe harus 'in' atau 'out'"),
];

module.exports = { adjustStockValidator };
