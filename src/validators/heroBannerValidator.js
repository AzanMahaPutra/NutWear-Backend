const { body } = require("express-validator");

const LINK_TYPES = ["none", "product", "category", "custom"];

/**
 * Field opsional yang sama untuk create & update (hanya divalidasi jika dikirim).
 */
const optionalFields = [
  body("title").optional({ checkFalsy: true }).isString().trim(),
  body("linkType").optional({ checkFalsy: true }).isIn(LINK_TYPES).withMessage("Jenis tujuan link tidak valid"),
  body("productId")
    .if(body("linkType").equals("product"))
    .isUUID()
    .withMessage("Produk tujuan wajib dipilih"),
  body("categoryId")
    .if(body("linkType").equals("category"))
    .isUUID()
    .withMessage("Kategori tujuan wajib dipilih"),
  body("customUrl")
    .if(body("linkType").equals("custom"))
    .trim()
    .isLength({ min: 1 })
    .withMessage("Link tujuan wajib diisi"),
  body("isActive").optional({ checkFalsy: true }).isBoolean(),
  body("sortOrder").optional({ checkFalsy: true }).isInt(),
];

const heroBannerCreateValidator = [...optionalFields];
const heroBannerUpdateValidator = [...optionalFields];

module.exports = { heroBannerCreateValidator, heroBannerUpdateValidator, LINK_TYPES };
