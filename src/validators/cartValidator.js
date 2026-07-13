const { body } = require("express-validator");

const addCartValidator = [
  body("variantId").isUUID().withMessage("variantId tidak valid"),
  body("quantity").isInt({ min: 1 }).withMessage("Jumlah minimal 1"),
];

const updateCartValidator = [body("quantity").isInt({ min: 1 }).withMessage("Jumlah minimal 1")];

module.exports = { addCartValidator, updateCartValidator };
