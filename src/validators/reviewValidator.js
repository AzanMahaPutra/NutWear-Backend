const { body } = require("express-validator");

const createReviewValidator = [
  body("productId").isUUID().withMessage("productId tidak valid"),
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating harus antara 1-5"),
  body("comment").optional().isString().isLength({ max: 1000 }),
];

module.exports = { createReviewValidator };
