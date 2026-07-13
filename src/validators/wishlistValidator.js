const { body } = require("express-validator");

const addWishlistValidator = [body("productId").isUUID().withMessage("productId tidak valid")];

module.exports = { addWishlistValidator };
