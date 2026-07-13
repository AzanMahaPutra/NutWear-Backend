const { body } = require("express-validator");

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
const WEIGHTS = ["normal", "medium", "semibold", "bold"];
const SIZES = ["small", "medium", "large"];

/**
 * Field opsional yang sama untuk create & update (hanya divalidasi jika dikirim).
 */
const optionalFields = [
  body("brandName").optional({ checkFalsy: true }).isString().trim(),
  body("brandLogoSize").optional({ checkFalsy: true }).isIn(SIZES).withMessage("Ukuran logo tidak valid"),

  body("titleColor").optional({ checkFalsy: true }).isString(),
  body("titleHeading").optional({ checkFalsy: true }).isIn(HEADINGS).withMessage("Heading judul tidak valid"),
  body("titleWeight").optional({ checkFalsy: true }).isIn(WEIGHTS).withMessage("Ketebalan font judul tidak valid"),

  body("subtitleText").optional({ checkFalsy: true }).isString(),
  body("subtitleColor").optional({ checkFalsy: true }).isString(),
  body("subtitleHeading").optional({ checkFalsy: true }).isIn(HEADINGS),
  body("subtitleWeight").optional({ checkFalsy: true }).isIn(WEIGHTS),

  body("priceNormalColor").optional({ checkFalsy: true }).isString(),
  body("priceNormalHeading").optional({ checkFalsy: true }).isIn(HEADINGS),

  body("priceBeforeDiscount").optional({ checkFalsy: true }).isInt({ min: 0 }),
  body("priceBeforeDiscountColor").optional({ checkFalsy: true }).isString(),
  body("priceBeforeDiscountHeading").optional({ checkFalsy: true }).isIn(HEADINGS),

  body("pricePromoColor").optional({ checkFalsy: true }).isString(),
  body("pricePromoHeading").optional({ checkFalsy: true }).isIn(HEADINGS),

  body("offerStartDate").optional({ checkFalsy: true }).isISO8601().withMessage("Tanggal mulai tidak valid"),
  body("offerEndDate").optional({ checkFalsy: true }).isISO8601().withMessage("Tanggal berakhir tidak valid"),
  body("offerColor").optional({ checkFalsy: true }).isString(),
  body("offerHeading").optional({ checkFalsy: true }).isIn(HEADINGS),

  body("ctaBgColor").optional({ checkFalsy: true }).isString(),
  body("ctaTextColor").optional({ checkFalsy: true }).isString(),
  body("ctaRadius").optional({ checkFalsy: true }).isInt({ min: 0 }),
  body("ctaSize").optional({ checkFalsy: true }).isIn(SIZES),

  body("isActive").optional({ checkFalsy: true }).isBoolean(),
  body("sortOrder").optional({ checkFalsy: true }).isInt(),
  body("removeBrandLogo").optional({ checkFalsy: true }).isBoolean(),
  // checkFalsy: string kosong ("") berarti admin mengosongkan produk tujuan, bukan error.
  body("productId").optional({ checkFalsy: true }).isUUID().withMessage("Produk tujuan tidak valid"),
];

const bannerCreateValidator = [
  body("titleText").trim().isLength({ min: 1 }).withMessage("Judul banner wajib diisi"),
  body("priceNormal").isInt({ min: 0 }).withMessage("Harga normal wajib diisi"),
  body("pricePromo").isInt({ min: 0 }).withMessage("Harga promo wajib diisi"),
  body("ctaText").trim().isLength({ min: 1 }).withMessage("Teks tombol CTA wajib diisi"),
  body("ctaLink").trim().isLength({ min: 1 }).withMessage("Link tombol CTA wajib diisi"),
  ...optionalFields,
];

const bannerUpdateValidator = [
  body("titleText").optional({ checkFalsy: true }).trim().isLength({ min: 1 }),
  body("priceNormal").optional({ checkFalsy: true }).isInt({ min: 0 }),
  body("pricePromo").optional({ checkFalsy: true }).isInt({ min: 0 }),
  body("ctaText").optional({ checkFalsy: true }).trim().isLength({ min: 1 }),
  body("ctaLink").optional({ checkFalsy: true }).trim().isLength({ min: 1 }),
  ...optionalFields,
];

module.exports = { bannerCreateValidator, bannerUpdateValidator, HEADINGS, WEIGHTS, SIZES };
